import { useMemo, type CSSProperties } from 'react';

import { Card } from '../ui';
import { useSessionStore } from '../../state/session';
import type { Participant } from '../../types/session';
import { useAuthStore } from '../../state/auth';

const listStyles: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const itemBaseStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.75rem',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border, #3a3a3a)',
  borderRadius: '0.5rem',
  transition: 'background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
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

const roleBadgeBaseStyles: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  textTransform: 'capitalize',
  fontWeight: 600,
};

const statusStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const statusIconBaseStyles: CSSProperties = {
  fontSize: '0.75rem',
};

const currentUserTagStyles: CSSProperties = {
  marginLeft: '0.4rem',
  color: 'var(--accent, #4a9eff)',
  fontSize: '0.8rem',
  fontWeight: 500,
};

const ROLE_PRIORITY = {
  facilitator: 0,
  explorer: 1,
  listener: 2,
} as const satisfies Record<Participant['role'], number>;

const ROLE_LABELS = {
  facilitator: 'Facilitator',
  explorer: 'Explorer',
  listener: 'Listener',
} as const satisfies Record<Participant['role'], string>;

const ROLE_BADGE_COLORS: Record<Participant['role'], CSSProperties> = {
  facilitator: {
    backgroundColor: 'var(--accent, #4a9eff)',
    color: '#0b1220',
  },
  explorer: {
    backgroundColor: 'rgba(74, 255, 74, 0.14)',
    color: 'var(--success, #4aff4a)',
  },
  listener: {
    backgroundColor: 'rgba(160, 160, 160, 0.18)',
    color: 'var(--text-secondary, #a0a0a0)',
  },
};

const getStatusText = (participant: Participant): string => {
  return participant.isOnline ? 'Online' : 'Offline';
};

const getStatusIconStyles = (participant: Participant): CSSProperties => {
  return {
    ...statusIconBaseStyles,
    color: participant.isOnline ? 'var(--success, #4aff4a)' : 'var(--border, #3a3a3a)',
  };
};

const getItemStyles = (isCurrentUser: boolean): CSSProperties => {
  if (!isCurrentUser) {
    return { ...itemBaseStyles };
  }

  return {
    ...itemBaseStyles,
    borderColor: 'var(--accent, #4a9eff)',
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    boxShadow: '0 0 0 1px rgba(74, 158, 255, 0.4)',
  };
};

export const ParticipantList = () => {
  const participants = useSessionStore((state) => state.participants);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

  const sortedParticipants = useMemo(() => {
    return participants
      .slice()
      .sort((participantA, participantB) => {
        const roleComparison =
          ROLE_PRIORITY[participantA.role] - ROLE_PRIORITY[participantB.role];

        if (roleComparison !== 0) {
          return roleComparison;
        }

        return participantA.username.localeCompare(participantB.username, undefined, {
          sensitivity: 'base',
        });
      });
  }, [participants]);

  return (
    <Card title="Participants">
      {sortedParticipants.length === 0 ? (
        <p style={{ color: 'var(--text-secondary, #a0a0a0)', margin: 0 }}>
          No participants connected yet.
        </p>
      ) : (
        <ul style={listStyles}>
          {sortedParticipants.map((participant) => {
            const isCurrentUser = participant.id === currentUserId;

            return (
              <li
                key={participant.id}
                style={getItemStyles(isCurrentUser)}
                aria-current={isCurrentUser ? 'true' : undefined}
              >
                <div style={infoStyles}>
                  <p style={usernameStyles}>
                    {participant.username}
                    {isCurrentUser ? <span style={currentUserTagStyles}>You</span> : null}
                  </p>
                  <span
                    style={{
                      ...roleBadgeBaseStyles,
                      ...ROLE_BADGE_COLORS[participant.role],
                    }}
                  >
                    {ROLE_LABELS[participant.role]}
                  </span>
                </div>
                <span style={statusStyles}>
                  <span aria-hidden="true" style={getStatusIconStyles(participant)}>
                    {participant.isOnline ? '●' : '○'}
                  </span>
                  <span>{getStatusText(participant)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

ParticipantList.displayName = 'ParticipantList';

export default ParticipantList;
