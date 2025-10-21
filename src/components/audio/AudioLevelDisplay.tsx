import type { CSSProperties, FC } from 'react';

export interface AudioLevelDisplayProps {
  label: string;
  level: number;
  isActive?: boolean;
}

const containerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const labelStyles: CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary, #a0a0a0)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const indicatorStyles: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
};

const barContainerStyles: CSSProperties = {
  position: 'relative',
  height: '12px',
  borderRadius: '6px',
  background: 'var(--bg-primary, #1a1a1a)',
  overflow: 'hidden',
  border: '1px solid var(--border, #3a3a3a)',
};

const getBarStyles = (level: number): CSSProperties => ({
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width: `${Math.max(0, Math.min(100, level))}%`,
  background: 'linear-gradient(90deg, #4aff4a 0%, #ffd54a 50%, #ff4a4a 100%)',
  transition: 'width 0.1s ease-out',
});

const getIndicatorStyles = (isActive: boolean): CSSProperties => ({
  ...indicatorStyles,
  background: isActive ? 'var(--success, #4aff4a)' : 'var(--border, #555)',
  boxShadow: isActive ? '0 0 6px rgba(74, 255, 74, 0.7)' : 'none',
});

export const AudioLevelDisplay: FC<AudioLevelDisplayProps> = ({
  label,
  level,
  isActive = true
}) => {
  const normalizedLevel = Math.round(Math.max(0, Math.min(100, level)));

  return (
    <div style={containerStyles}>
      <div style={labelStyles}>
        <span style={getIndicatorStyles(isActive)} aria-hidden="true" />
        <span>{label}</span>
        {isActive && <span style={{ fontSize: '0.8rem' }}>({normalizedLevel}%)</span>}
      </div>
      <div style={barContainerStyles} role="progressbar" aria-valuenow={normalizedLevel} aria-valuemin={0} aria-valuemax={100}>
        <div style={getBarStyles(normalizedLevel)} />
      </div>
    </div>
  );
};

AudioLevelDisplay.displayName = 'AudioLevelDisplay';

export default AudioLevelDisplay;
