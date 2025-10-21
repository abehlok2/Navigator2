import { useState, type CSSProperties } from 'react';

import { Card } from '../ui';
import { SessionHeader } from './SessionHeader';
import { ParticipantList } from './ParticipantList';
import { SessionNotes } from './SessionNotes';
import { VolumeControl } from '../audio/VolumeControl';
import { useSessionStore } from '../../state/session';

const containerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  height: '100%',
};

const statusIndicatorStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
  borderRadius: '0.375rem',
  backgroundColor: 'var(--background-secondary, #2a2a2a)',
  marginTop: '-0.5rem',
};

const statusDotStyles: CSSProperties = {
  width: '0.5rem',
  height: '0.5rem',
  borderRadius: '50%',
  backgroundColor: 'var(--accent, #4a9eff)',
};

const statusTextStyles: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'var(--text-primary, #ffffff)',
  margin: 0,
};

const statusBadgeStyles: CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '0.25rem',
  backgroundColor: 'rgba(160, 160, 160, 0.18)',
  color: 'var(--text-secondary, #a0a0a0)',
  fontWeight: 500,
};

const cardContentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
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

export const ListenerPanel = () => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  // Volume state for different audio sources (local control only)
  const [masterVolume, setMasterVolume] = useState(80);
  const [masterMuted, setMasterMuted] = useState(false);

  const [backgroundVolume, setBackgroundVolume] = useState(60);
  const [backgroundMuted, setBackgroundMuted] = useState(false);

  const [voicesVolume, setVoicesVolume] = useState(90);
  const [voicesMuted, setVoicesMuted] = useState(false);

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

      {/* Listen-only Status Indicator */}
      <div style={statusIndicatorStyles}>
        <div style={statusDotStyles} />
        <span style={statusTextStyles}>Connected</span>
        <span style={statusBadgeStyles}>Listen-only</span>
      </div>

      {/* Audio Feed Section */}
      <Card title="Audio Feed">
        <div style={cardContentStyles}>
          {/* Master Volume Control */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Master Volume</h3>
            <VolumeControl
              label="Master"
              volume={masterVolume}
              onVolumeChange={setMasterVolume}
              onMute={setMasterMuted}
              isMuted={masterMuted}
            />
          </section>

          {/* Background Audio Volume Control */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Background Audio</h3>
            <VolumeControl
              label="Background"
              volume={backgroundVolume}
              onVolumeChange={setBackgroundVolume}
              onMute={setBackgroundMuted}
              isMuted={backgroundMuted}
            />
          </section>

          {/* Voices Volume Control */}
          <section style={sectionStyles}>
            <h3 style={sectionTitleStyles}>Voice Chat</h3>
            <VolumeControl
              label="Voices"
              volume={voicesVolume}
              onVolumeChange={setVoicesVolume}
              onMute={setVoicesMuted}
              isMuted={voicesMuted}
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

ListenerPanel.displayName = 'ListenerPanel';

export default ListenerPanel;
