import type { CSSProperties, FC } from 'react';

import type { ConnectionStatus as ConnectionStatusType } from '../../types/session';

export interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

type StatusConfig = {
  label: string;
  color: string;
};

type StatusConfigMap = Record<ConnectionStatusType, StatusConfig>;

const wrapperStyles: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: 'var(--text-secondary, #a0a0a0)',
  fontSize: '0.9rem',
};

const indicatorStyles: CSSProperties = {
  width: '0.75rem',
  height: '0.75rem',
  borderRadius: '50%',
  display: 'inline-block',
};

const statusConfig: StatusConfigMap = {
  connected: {
    label: 'Connected',
    color: 'var(--success, #22c55e)',
  },
  connecting: {
    label: 'Connecting...',
    color: 'var(--warning, #facc15)',
  },
  disconnected: {
    label: 'Connection lost',
    color: 'var(--error, #ef4444)',
  },
  error: {
    label: 'Error',
    color: 'var(--error, #ef4444)',
  },
};

export const ConnectionStatus: FC<ConnectionStatusProps> = ({ status }) => {
  const { label, color } = statusConfig[status];

  return (
    <span role="status" style={wrapperStyles} aria-live="polite">
      <span
        aria-hidden="true"
        style={{
          ...indicatorStyles,
          backgroundColor: color,
        }}
      />
      <span>{label}</span>
    </span>
  );
};

ConnectionStatus.displayName = 'ConnectionStatus';

export default ConnectionStatus;
