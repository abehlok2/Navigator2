import type { CSSProperties, FC } from 'react';

export interface BackgroundAudioStatusProps {
  isPlaying: boolean;
  fileName?: string;
  currentTime?: number;
  duration?: number;
}

const containerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border, #3a3a3a)',
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
};

const headerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.9rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const fileNameStyles: CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 500,
  color: 'var(--text-primary, #ffffff)',
  wordBreak: 'break-word',
};

const progressBarContainerStyles: CSSProperties = {
  height: '6px',
  borderRadius: '3px',
  backgroundColor: 'var(--bg-primary, #1a1a1a)',
  overflow: 'hidden',
};

const timeDisplayStyles: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.8rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

const statusIndicatorStyles: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

const getProgressBarStyles = (progress: number): CSSProperties => ({
  height: '100%',
  width: `${Math.max(0, Math.min(100, progress))}%`,
  backgroundColor: 'var(--accent, #4a9eff)',
  transition: 'width 0.2s ease-out',
});

const getStatusIndicatorStyles = (isPlaying: boolean): CSSProperties => ({
  ...statusIndicatorStyles,
  backgroundColor: isPlaying ? 'var(--success, #4aff4a)' : 'var(--text-secondary, #a0a0a0)',
  boxShadow: isPlaying ? '0 0 6px rgba(74, 255, 74, 0.7)' : 'none',
});

export const BackgroundAudioStatus: FC<BackgroundAudioStatusProps> = ({
  isPlaying,
  fileName,
  currentTime = 0,
  duration = 0,
}) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasFile = Boolean(fileName);

  return (
    <div style={containerStyles}>
      <div style={headerStyles}>
        <span style={getStatusIndicatorStyles(isPlaying)} aria-hidden="true" />
        <span>{isPlaying ? 'Playing' : hasFile ? 'Paused' : 'No Audio'}</span>
      </div>

      {hasFile && (
        <>
          <div style={fileNameStyles}>{fileName}</div>
          <div style={progressBarContainerStyles} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div style={getProgressBarStyles(progress)} />
          </div>
          <div style={timeDisplayStyles}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </>
      )}

      {!hasFile && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #a0a0a0)' }}>
          No background audio loaded
        </div>
      )}
    </div>
  );
};

BackgroundAudioStatus.displayName = 'BackgroundAudioStatus';

export default BackgroundAudioStatus;
