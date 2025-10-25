import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { Card } from '../ui';
import { SessionHeader } from './SessionHeader';
import { SessionNotes } from './SessionNotes';
import { ParticipantList } from './ParticipantList';
import { MicrophoneControl } from '../audio/MicrophoneControl';
import { AudioLevelDisplay } from '../audio/AudioLevelDisplay';
import { BackgroundAudioStatus } from '../audio/BackgroundAudioStatus';
import { VolumeControl } from '../audio/VolumeControl';
import { useSessionStore } from '../../state/session';
import { useAuthStore } from '../../state/auth';
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

const contentLayoutStyles: CSSProperties = {
  display: 'grid',
  gap: '1.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  alignItems: 'start',
};

const mainContentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const sidebarStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
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
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

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

  // Volume controls
  const [facilitatorVolume, setFacilitatorVolume] = useState(100);
  const [facilitatorMuted, setFacilitatorMuted] = useState(false);
  const [backgroundVolume, setBackgroundVolume] = useState(80);
  const [backgroundMuted, setBackgroundMuted] = useState(false);
  const [explorerMicVolume, setExplorerMicVolume] = useState(100);
  const [explorerMicMuted, setExplorerMicMuted] = useState(false);

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
          // ⚠️ CRITICAL FIX: Check transceiver direction before replacing
          const transceiver = facilitatorConnection.getTransceivers().find(t => t.sender === existingSender);

          if (transceiver && transceiver.currentDirection === 'inactive') {
            console.warn(`[ExplorerPanel] Transceiver for facilitator is inactive, fixing...`);
            transceiver.direction = 'sendonly';
            // Transceiver direction change requires renegotiation
            // This will trigger negotiationneeded event
          }

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

  // Volume control handlers - these send control messages to sync with facilitator
  const handleFacilitatorVolumeChange = useCallback((volume: number) => {
    setFacilitatorVolume(volume);
    const normalizedVolume = facilitatorMuted ? 0 : volume / 100;

    if (audioMixer) {
      audioMixer.setFacilitatorVolume(normalizedVolume);
    }

    if (controlChannel) {
      controlChannel.send('audio:facilitator-volume', {
        volume: normalizedVolume,
      });
    }
  }, [audioMixer, controlChannel, facilitatorMuted]);

  const handleFacilitatorMute = useCallback((muted: boolean) => {
    setFacilitatorMuted(muted);
    const normalizedVolume = muted ? 0 : facilitatorVolume / 100;

    if (audioMixer) {
      audioMixer.setFacilitatorVolume(normalizedVolume);
    }

    if (controlChannel) {
      controlChannel.send('audio:facilitator-volume', {
        volume: normalizedVolume,
      });
    }
  }, [audioMixer, controlChannel, facilitatorVolume]);

  const handleBackgroundVolumeChange = useCallback((volume: number) => {
    setBackgroundVolume(volume);
    const normalizedVolume = backgroundMuted ? 0 : volume / 100;

    if (audioMixer) {
      audioMixer.setBackgroundVolume(normalizedVolume);
    }

    if (controlChannel) {
      controlChannel.send('audio:volume', {
        volume: normalizedVolume,
      });
    }
  }, [audioMixer, controlChannel, backgroundMuted]);

  const handleBackgroundMute = useCallback((muted: boolean) => {
    setBackgroundMuted(muted);
    const normalizedVolume = muted ? 0 : backgroundVolume / 100;

    if (audioMixer) {
      audioMixer.setBackgroundVolume(normalizedVolume);
    }

    if (controlChannel) {
      controlChannel.send('audio:volume', {
        volume: normalizedVolume,
      });
    }
  }, [audioMixer, controlChannel, backgroundVolume]);

  const handleExplorerMicVolumeChange = useCallback((volume: number) => {
    setExplorerMicVolume(volume);
    const normalizedVolume = explorerMicMuted ? 0 : volume / 100;

    // Get explorer's own ID
    const explorerId = participants.find((p) => p.role === 'explorer' && p.id === currentUserId)?.id;
    if (!explorerId) {
      return;
    }

    // Explorer can't directly control their own mic volume on facilitator's side
    // But we send the message so facilitator can update their UI
    if (controlChannel) {
      controlChannel.send('audio:explorer-volume', {
        explorerId,
        volume: normalizedVolume,
      });
    }
  }, [controlChannel, currentUserId, explorerMicMuted, participants]);

  const handleExplorerMicMute = useCallback((muted: boolean) => {
    setExplorerMicMuted(muted);
    const normalizedVolume = muted ? 0 : explorerMicVolume / 100;

    // Get explorer's own ID
    const explorerId = participants.find((p) => p.role === 'explorer' && p.id === currentUserId)?.id;
    if (!explorerId) {
      return;
    }

    // Send message to facilitator
    if (controlChannel) {
      controlChannel.send('audio:explorer-volume', {
        explorerId,
        volume: normalizedVolume,
      });
    }
  }, [controlChannel, currentUserId, explorerMicVolume, participants]);

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

    // Handle audio:next-track messages
    const handleAudioNextTrack = (message: import('../../types/control-messages').AudioNextTrackMessage) => {
      console.log('[ExplorerPanel] Next track queued:', message.nextFileName);
      // Update UI to show the next track info
      setBackgroundAudioState((prev) => ({
        ...prev,
        fileName: message.nextFileName,
        duration: message.nextDuration,
        currentTime: 0,
      }));
    };

    // Handle audio:crossfade-start messages
    const handleAudioCrossfadeStart = (message: import('../../types/control-messages').AudioCrossfadeStartMessage) => {
      console.log('[ExplorerPanel] Crossfade started from', message.fromFileName, 'to', message.toFileName);
      // The actual audio crossfade happens automatically on the facilitator side
      // Explorers just receive the audio stream with the crossfade already applied
    };

    // Handle audio:facilitator-volume messages
    const handleFacilitatorVolume = (message: import('../../types/control-messages').AudioFacilitatorVolumeMessage) => {
      const volumePercent = Math.round(message.volume * 100);
      setFacilitatorVolume(volumePercent);
      setFacilitatorMuted(message.volume === 0);

      if (audioMixer) {
        audioMixer.setFacilitatorVolume(message.volume);
      }
    };

    // Handle audio:explorer-volume messages
    const handleExplorerVolume = (message: import('../../types/control-messages').AudioExplorerVolumeMessage) => {
      // Check if this message is for this explorer
      if (currentUserId && message.explorerId === currentUserId) {
        const volumePercent = Math.round(message.volume * 100);
        setExplorerMicVolume(volumePercent);
        setExplorerMicMuted(message.volume === 0);
      }
    };

    // Register event handlers
    controlChannel.on('audio:play', handleAudioPlay);
    controlChannel.on('audio:pause', handleAudioPause);
    controlChannel.on('audio:stop', handleAudioStop);
    controlChannel.on('audio:progress', handleAudioProgress);
    controlChannel.on('audio:volume', handleAudioVolume);
    controlChannel.on('audio:file-loaded', handleAudioFileLoaded);
    controlChannel.on('audio:next-track', handleAudioNextTrack);
    controlChannel.on('audio:crossfade-start', handleAudioCrossfadeStart);
    controlChannel.on('audio:facilitator-volume', handleFacilitatorVolume);
    controlChannel.on('audio:explorer-volume', handleExplorerVolume);

    // Cleanup handlers on unmount
    return () => {
      controlChannel.off('audio:play', handleAudioPlay);
      controlChannel.off('audio:pause', handleAudioPause);
      controlChannel.off('audio:stop', handleAudioStop);
      controlChannel.off('audio:progress', handleAudioProgress);
      controlChannel.off('audio:volume', handleAudioVolume);
      controlChannel.off('audio:file-loaded', handleAudioFileLoaded);
      controlChannel.off('audio:next-track', handleAudioNextTrack);
      controlChannel.off('audio:crossfade-start', handleAudioCrossfadeStart);
      controlChannel.off('audio:facilitator-volume', handleFacilitatorVolume);
      controlChannel.off('audio:explorer-volume', handleExplorerVolume);
    };
  }, [audioMixer, controlChannel, currentUserId, latencyCompensator]);

  // Re-send microphone track when facilitator connection changes (e.g., facilitator reconnects)
  useEffect(() => {
    if (!peerManager || !isMicActive || !micStream) {
      return;
    }

    // Find the facilitator participant
    const facilitator = participants.find((p) => p.role === 'facilitator');
    if (!facilitator) {
      return;
    }

    const facilitatorConnection = peerManager.getConnection(facilitator.id);
    if (!facilitatorConnection) {
      return;
    }

    // Check if we already have a sender for this connection
    const existingSender = micSenderRef.current;
    if (existingSender) {
      // Verify the sender still belongs to the current connection
      const senders = facilitatorConnection.getSenders();
      if (senders.includes(existingSender)) {
        // Sender is still valid, no need to re-add
        return;
      }
    }

    // Re-add microphone track to the (new) facilitator connection
    console.log('[ExplorerPanel] Re-adding microphone track to facilitator connection');
    addAudioTrack(facilitatorConnection, micStream)
      .then((sender) => {
        micSenderRef.current = sender;
        console.log('[ExplorerPanel] Successfully re-added microphone track to facilitator');
      })
      .catch((error) => {
        console.error('[ExplorerPanel] Failed to re-add microphone track:', error);
      });
  }, [participants, peerManager, isMicActive, micStream]);

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

      <div style={contentLayoutStyles}>
        <div style={mainContentStyles}>
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
                {isMicActive && (
                  <VolumeControl
                    label="My Microphone Volume"
                    volume={explorerMicVolume}
                    onVolumeChange={handleExplorerMicVolumeChange}
                    onMute={handleExplorerMicMute}
                    isMuted={explorerMicMuted}
                  />
                )}
              </section>

              {/* Incoming Audio Level (Facilitator) */}
              <section style={sectionStyles}>
                <h3 style={sectionTitleStyles}>Incoming Audio</h3>
                <AudioLevelDisplay
                  label="Facilitator"
                  level={facilitatorAudioLevel}
                  isActive={connectionStatus === 'connected'}
                />
                <VolumeControl
                  label="Facilitator Voice Volume"
                  volume={facilitatorVolume}
                  onVolumeChange={handleFacilitatorVolumeChange}
                  onMute={handleFacilitatorMute}
                  isMuted={facilitatorMuted}
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
                <VolumeControl
                  label="Background Audio Volume"
                  volume={backgroundVolume}
                  onVolumeChange={handleBackgroundVolumeChange}
                  onMute={handleBackgroundMute}
                  isMuted={backgroundMuted}
                />
              </section>
            </div>
          </Card>
        </div>

        <div style={sidebarStyles}>
          {/* Session Notes */}
          {roomId && <SessionNotes roomId={roomId} />}

          {/* Participant List */}
          <ParticipantList />
        </div>
      </div>
    </div>
  );
};

ExplorerPanel.displayName = 'ExplorerPanel';

export default ExplorerPanel;
