import type { CSSProperties, FC } from 'react';

import { ConnectionStatus } from './ConnectionStatus';
import type { SessionOverview } from '../../types/session';

export type SessionHeaderProps = SessionOverview;

const headerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1.5rem',
  padding: '1rem 1.5rem',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  borderRadius: '0.75rem',
  border: '1px solid var(--border, #3a3a3a)',
};

const titleStyles: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 600,
  color: 'var(--text-primary, #ffffff)',
};

const participantsStyles: CSSProperties = {
  marginLeft: '0.5rem',
  color: 'var(--text-secondary, #a0a0a0)',
  fontWeight: 500,
};

export const SessionHeader: FC<SessionHeaderProps> = ({
  roomId,
  participantCount,
  connectionStatus,
}) => {
  const participantLabel = participantCount === 1 ? 'participant' : 'participants';

  return (
    <header style={headerStyles}>
      <h2 style={titleStyles}>
        Session: Room {roomId} -
        <span style={participantsStyles}>
          {participantCount} {participantLabel}
        </span>
      </h2>
      <ConnectionStatus status={connectionStatus} />
    </header>
  );
};

SessionHeader.displayName = 'SessionHeader';

export default SessionHeader;
