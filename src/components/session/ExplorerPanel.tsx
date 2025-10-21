import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { Card } from '../ui';
import { SessionHeader } from './SessionHeader';
import { SessionNotes } from './SessionNotes';
import { ParticipantList } from './ParticipantList';
import { MicrophoneControl } from '../audio/MicrophoneControl';
import { AudioLevelDisplay } from '../audio/AudioLevelDisplay';
import { BackgroundAudioStatus } from '../audio/BackgroundAudioStatus';
import { useSessionStore } from '../../state/session';

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

export const ExplorerPanel = () => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  // Microphone state
  const [isMicActive, setIsMicActive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | undefined>();

  // Audio level state (incoming from facilitator)
  const [facilitatorAudioLevel, setFacilitatorAudioLevel] = useState(0);

  // Background audio state (synced from facilitator - placeholder for now)
  const [backgroundAudioState, setBackgroundAudioState] = useState({
    isPlaying: false,
    fileName: undefined as string | undefined,
    currentTime: 0,
    duration: 0,
  });

  // Microphone toggle handler
  const handleMicrophoneToggle = useCallback((active: boolean, stream?: MediaStream) => {
    setIsMicActive(active);
    setMicStream(stream);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop microphone stream if active
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [micStream]);

  // Placeholder: Simulate incoming audio levels from facilitator
  // TODO: Replace with actual WebRTC audio level monitoring
  useEffect(() => {
    if (!connectionStatus || connectionStatus === 'disconnected') {
      setFacilitatorAudioLevel(0);
      return;
    }

    const interval = setInterval(() => {
      // Simulate audio level changes for demonstration
      // In production, this would come from actual WebRTC peer connection
      setFacilitatorAudioLevel(Math.random() * 30);
    }, 100);

    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Placeholder: Background audio sync
  // TODO: Replace with actual signaling from facilitator
  useEffect(() => {
    // In production, this would listen to signaling messages from facilitator
    // For now, we'll just initialize with empty state
    setBackgroundAudioState({
      isPlaying: false,
      fileName: undefined,
      currentTime: 0,
      duration: 0,
    });
  }, []);

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
