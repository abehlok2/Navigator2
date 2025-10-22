import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { Card } from '../ui';
import { SessionHeader } from './SessionHeader';
import { SessionNotes } from './SessionNotes';
import { ParticipantList } from './ParticipantList';
import { MicrophoneControl } from '../audio/MicrophoneControl';
import { AudioLevelDisplay } from '../audio/AudioLevelDisplay';
import { BackgroundAudioStatus } from '../audio/BackgroundAudioStatus';
import { useSessionStore } from '../../state/session';
import type { ControlChannel } from '../../features/webrtc/ControlChannel';
import { LatencyCompensator } from '../../features/audio/latencyCompensation';
import type { PeerConnectionManager } from '../../features/webrtc/peerManager';
import { addAudioTrack, replaceAudioTrack } from '../../features/webrtc/connection';
import type { ExplorerAudioMixer } from '../../features/audio/explorerMixer';
import type { AudioLevelMonitor } from '../../features/audio/microphone';

const containerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  height: '100%',
};

const sectionStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const sectionTitleStyles: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 600,
  color: 'var(--text-primary, #ffffff)',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid var(--border, #3a3a3a)',
};

const cardContentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
};

export interface ExplorerPanelProps {
  controlChannel: ControlChannel | null;
  peerManager: PeerConnectionManager | null;
  audioMixer: ExplorerAudioMixer | null;
}

export const ExplorerPanel = ({ controlChannel, peerManager, audioMixer }: ExplorerPanelProps) => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  // Microphone state
  const [isMicActive, setIsMicActive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | undefined>();

  // Audio level state (incoming from facilitator)
  const [facilitatorAudioLevel, setFacilitatorAudioLevel] = useState(0);

  // Ref to store the audio sender for the microphone track
  const micSenderRef = useRef<RTCRtpSender | null>(null);

  // Ref to store the audio level monitor for facilitator audio
  const levelMonitorRef = useRef<AudioLevelMonitor | null>(null);

  // Background audio state (synced from facilitator via control messages)
  const [backgroundAudioState, setBackgroundAudioState] = useState({
    isPlaying: false,
    fileName: undefined as string | undefined,
    currentTime: 0,
    duration: 0,
    volume: 1,
  });

  // Latency compensator for synchronized audio playback
  const [latencyCompensator] = useState(() => new LatencyCompensator());

  // Microphone toggle handler
  const handleMicrophoneToggle = useCallback(async (active: boolean, stream?: MediaStream) => {
    setIsMicActive(active);
    setMicStream(stream);

    if (!peerManager) {
      console.warn('[ExplorerPanel] No peer manager available');
      return;
    }

    // Find the facilitator participant
    const facilitator = participants.find((p) => p.role === 'facilitator');
    if (!facilitator) {
      console.warn('[ExplorerPanel] No facilitator found in participants');
      return;
    }

    const facilitatorConnection = peerManager.getConnection(facilitator.id);
    if (!facilitatorConnection) {
      console.warn('[ExplorerPanel] No peer connection to facilitator');
      return;
    }

    if (active && stream) {
      try {
        const existingSender = micSenderRef.current;

        if (existingSender) {
          // Replace the existing track
          await replaceAudioTrack(existingSender, stream);
          console.log('[ExplorerPanel] Replaced microphone track to facilitator');
        } else {
          // Add new track
          const sender = await addAudioTrack(facilitatorConnection, stream);
          micSenderRef.current = sender;
          console.log('[ExplorerPanel] Added microphone track to facilitator');
        }
      } catch (error) {
        console.error('[ExplorerPanel] Failed to add/replace microphone track:', error);
      }
    } else if (micSenderRef.current) {
      // Microphone disabled - remove the track
      try {
        await micSenderRef.current.replaceTrack(null);
        console.log('[ExplorerPanel] Removed microphone track from facilitator');
      } catch (error) {
        console.error('[ExplorerPanel] Failed to remove microphone track:', error);
      }
    }
  }, [peerManager, participants]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop microphone stream if active
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
      }

      // Clear microphone sender if active
      if (micSenderRef.current) {
        micSenderRef.current.replaceTrack(null).catch(() => {
          /* ignore cleanup errors */
        });
        micSenderRef.current = null;
      }
    };
  }, [micStream]);

  // Monitor facilitator audio levels
  useEffect(() => {
    if (!audioMixer || !connectionStatus || connectionStatus === 'disconnected') {
      setFacilitatorAudioLevel(0);

      // Stop monitoring if active
      if (levelMonitorRef.current) {
        levelMonitorRef.current.stopMonitoring();
        levelMonitorRef.current = null;
      }

      return;
    }

    // Create and start level monitor for facilitator audio
    if (!levelMonitorRef.current) {
      try {
        const monitor = audioMixer.createLevelMonitor('facilitator');
        monitor.startMonitoring((level) => {
          setFacilitatorAudioLevel(level);
        });
        levelMonitorRef.current = monitor;
        console.log('[ExplorerPanel] Started monitoring facilitator audio levels');
      } catch (error) {
        console.error('[ExplorerPanel] Failed to create level monitor:', error);
      }
    }

    return () => {
      if (levelMonitorRef.current) {
        levelMonitorRef.current.stopMonitoring();
        levelMonitorRef.current = null;
      }
    };
  }, [audioMixer, connectionStatus]);

  // Measure latency periodically for synchronized audio playback
  useEffect(() => {
    if (!controlChannel) {
      return;
    }

    // Measure latency on connection
    latencyCompensator.measureLatency(controlChannel).then((latency) => {
      console.log(`Estimated latency: ${latency}ms`);
    });

    // Re-measure every 30 seconds
    const interval = setInterval(() => {
      latencyCompensator.measureLatency(controlChannel).then((latency) => {
        console.log(`Updated latency: ${latency}ms`);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [controlChannel, latencyCompensator]);

  // Listen for control messages from facilitator
  useEffect(() => {
    if (!controlChannel) {
      return;
    }

    // Handle audio:play messages
    const handleAudioPlay = (message: import('../../types/control-messages').AudioPlayMessage) => {
      setBackgroundAudioState((prev) => ({
        ...prev,
        isPlaying: true,
        fileName: message.fileName ?? prev.fileName,
      }));
    };

    // Handle audio:pause messages
    const handleAudioPause = (message: import('../../types/control-messages').AudioPauseMessage) => {
      setBackgroundAudioState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: message.currentTime ?? prev.currentTime,
      }));
    };

    // Handle audio:stop messages
    const handleAudioStop = () => {
      setBackgroundAudioState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: 0,
      }));
    };

    // Handle audio:progress messages
    const handleAudioProgress = (message: import('../../types/control-messages').AudioProgressMessage) => {
      // Apply latency compensation to synchronize playback
      const compensatedTime = message.currentTime + (latencyCompensator.getEstimatedLatency() / 1000);
      setBackgroundAudioState((prev) => ({
        ...prev,
        currentTime: compensatedTime,
        duration: message.duration,
      }));
    };

    // Handle audio:volume messages
    const handleAudioVolume = (message: import('../../types/control-messages').AudioVolumeMessage) => {
      setBackgroundAudioState((prev) => ({
        ...prev,
        volume: message.volume,
      }));
    };

    // Handle audio:file-loaded messages
    const handleAudioFileLoaded = (message: import('../../types/control-messages').AudioFileLoadedMessage) => {
      setBackgroundAudioState((prev) => ({
        ...prev,
        fileName: message.fileName,
        duration: message.duration,
        currentTime: 0,
        isPlaying: false,
      }));
    };

    // Register event handlers
    controlChannel.on('audio:play', handleAudioPlay);
    controlChannel.on('audio:pause', handleAudioPause);
    controlChannel.on('audio:stop', handleAudioStop);
    controlChannel.on('audio:progress', handleAudioProgress);
    controlChannel.on('audio:volume', handleAudioVolume);
    controlChannel.on('audio:file-loaded', handleAudioFileLoaded);

    // Cleanup handlers on unmount
    return () => {
      controlChannel.off('audio:play', handleAudioPlay);
      controlChannel.off('audio:pause', handleAudioPause);
      controlChannel.off('audio:stop', handleAudioStop);
      controlChannel.off('audio:progress', handleAudioProgress);
      controlChannel.off('audio:volume', handleAudioVolume);
      controlChannel.off('audio:file-loaded', handleAudioFileLoaded);
    };
  }, [controlChannel, latencyCompensator]);

  // Get session overview data
  const sessionOverview = {
    roomId: roomId ?? 'N/A',
    participantCount: participants.length,
    connectionStatus,
  };

  return (
    <div style={containerStyles}>
      {/* Session Header */}
      <SessionHeader {...sessionOverview} />

      {/* Voice Channel Section */}
      <Card title="Voice Channel">
        <div style={cardContentStyles}>
          {/* Microphone Control */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Microphone</h3>
            <MicrophoneControl
              onToggle={handleMicrophoneToggle}
              isActive={isMicActive}
            />
          </section>

          {/* Incoming Audio Level (Facilitator) */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Incoming Audio</h3>
            <AudioLevelDisplay
              label="Facilitator"
              level={facilitatorAudioLevel}
              isActive={connectionStatus === 'connected'}
            />
          </section>

          {/* Background Audio Status */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Background Audio</h3>
            <BackgroundAudioStatus
              isPlaying={backgroundAudioState.isPlaying}
              fileName={backgroundAudioState.fileName}
              currentTime={backgroundAudioState.currentTime}
              duration={backgroundAudioState.duration}
            />
          </section>
        </div>
      </Card>

      {/* Session Notes */}
      {roomId && <SessionNotes roomId={roomId} />}

      {/* Participant List */}
      <ParticipantList />
    </div>
  );
};

ExplorerPanel.displayName = 'ExplorerPanel';

export default ExplorerPanel;
