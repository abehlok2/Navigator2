import type { CSSProperties } from 'react';

import { Card } from '../ui';
import { useSessionStore } from '../../state/session';
import type { Participant } from '../../types/session';

const listStyles: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const itemStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.75rem',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border, #3a3a3a)',
  borderRadius: '0.5rem',
};

const infoStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const usernameStyles: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: 'var(--text-primary, #ffffff)',
};

const roleBadgeStyles: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  backgroundColor: 'var(--bg-secondary, #2a2a2a)',
  color: 'var(--text-secondary, #a0a0a0)',
  fontSize: '0.75rem',
  textTransform: 'capitalize',
};

const statusStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const indicatorBaseStyles: CSSProperties = {
  display: 'inline-block',
  width: '0.65rem',
  height: '0.65rem',
  borderRadius: '50%',
};

const getStatusText = (participant: Participant): string => {
  return participant.isOnline ? 'Online' : 'Offline';
};

const getIndicatorStyles = (participant: Participant): CSSProperties => {
  return {
    ...indicatorBaseStyles,
    backgroundColor: participant.isOnline ? 'var(--success, #4aff4a)' : 'var(--border, #3a3a3a)',
    opacity: participant.isOnline ? 1 : 0.45,
  };
};

export const ParticipantList = () => {
  const participants = useSessionStore((state) => state.participants);

  return (
    <Card title="Participants">
      {participants.length === 0 ? (
        <p style={{ color: 'var(--text-secondary, #a0a0a0)', margin: 0 }}>
          No participants connected yet.
        </p>
      ) : (
        <ul style={listStyles}>
          {participants.map((participant) => (
            <li key={participant.id} style={itemStyles}>
              <div style={infoStyles}>
                <p style={usernameStyles}>{participant.username}</p>
                <span style={roleBadgeStyles}>{participant.role}</span>
              </div>
              <span style={statusStyles}>
                <span aria-hidden="true" style={getIndicatorStyles(participant)} />
                {getStatusText(participant)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

ParticipantList.displayName = 'ParticipantList';

export default ParticipantList;
