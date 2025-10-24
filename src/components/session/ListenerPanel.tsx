import { useCallback, useState, type CSSProperties } from 'react';

import { Card } from '../ui';
import { SessionHeader } from './SessionHeader';
import { ParticipantList } from './ParticipantList';
import { SessionNotes } from './SessionNotes';
import { VolumeControl } from '../audio/VolumeControl';
import { useSessionStore } from '../../state/session';
import type { ListenerAudioMixer } from '../../features/audio/listenerMixer';

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

export interface ListenerPanelProps {
  audioMixer: ListenerAudioMixer | null;
}

export const ListenerPanel = ({ audioMixer }: ListenerPanelProps) => {
  const roomId = useSessionStore((state) => state.roomId);
  const participants = useSessionStore((state) => state.participants);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);

  // Volume state for different audio sources (local control only)
  const [masterVolume, setMasterVolume] = useState(80);
  const [masterMuted, setMasterMuted] = useState(false);

  // Note: For listeners, we might want separate controls for different sources
  // but for now, master volume controls everything

  // Master volume handler
  const handleMasterVolumeChange = useCallback((volume: number) => {
    setMasterVolume(volume);
    const normalizedVolume = masterMuted ? 0 : volume / 100;

    if (audioMixer) {
      audioMixer.setMasterVolume(normalizedVolume);
    }
  }, [audioMixer, masterMuted]);

  const handleMasterMute = useCallback((muted: boolean) => {
    setMasterMuted(muted);
    const normalizedVolume = muted ? 0 : masterVolume / 100;

    if (audioMixer) {
      audioMixer.setMasterVolume(normalizedVolume);
    }
  }, [audioMixer, masterVolume]);

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
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #a0a0a0)', margin: 0 }}>
                  Control the overall volume of all incoming audio.
                </p>
                <VolumeControl
                  label="Master"
                  volume={masterVolume}
                  onVolumeChange={handleMasterVolumeChange}
                  onMute={handleMasterMute}
                  isMuted={masterMuted}
                />
              </section>

              {/* Info about listen-only mode */}
              <section style={sectionStyles}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #a0a0a0)', margin: 0 }}>
                  You are in listen-only mode. You can hear all participants and background audio but cannot speak.
                </p>
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

ListenerPanel.displayName = 'ListenerPanel';

export default ListenerPanel;
