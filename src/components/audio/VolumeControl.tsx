import { type CSSProperties } from 'react';

export interface VolumeControlProps {
  label: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onMute: (muted: boolean) => void;
  isMuted?: boolean;
}

const containerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.75rem',
  borderRadius: '0.375rem',
  backgroundColor: 'var(--background-secondary, #2a2a2a)',
};

const headerStyles: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
};

const labelStyles: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'var(--text-primary, #ffffff)',
  margin: 0,
};

const volumeRowStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
};

const sliderStyles: CSSProperties = {
  flex: 1,
  height: '0.25rem',
  borderRadius: '0.125rem',
  appearance: 'none',
  backgroundColor: 'var(--border, #3a3a3a)',
  outline: 'none',
  cursor: 'pointer',
};

const muteButtonStyles: CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.75rem',
  fontWeight: 500,
  borderRadius: '0.25rem',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s',
  backgroundColor: 'var(--background-tertiary, #1a1a1a)',
  color: 'var(--text-secondary, #a0a0a0)',
};

const muteButtonActivedStyles: CSSProperties = {
  ...muteButtonStyles,
  backgroundColor: 'var(--accent, #4a9eff)',
  color: 'var(--text-primary, #ffffff)',
};

const volumeValueStyles: CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--text-secondary, #a0a0a0)',
  minWidth: '2.5rem',
  textAlign: 'right',
};

export const VolumeControl = ({
  label,
  volume,
  onVolumeChange,
  onMute,
  isMuted = false,
}: VolumeControlProps) => {
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(event.target.value);
    onVolumeChange(newVolume);
  };

  const handleMuteToggle = () => {
    onMute(!isMuted);
  };

  return (
    <div style={containerStyles}>
      <div style={headerStyles}>
        <span style={labelStyles}>{label}</span>
        <button
          onClick={handleMuteToggle}
          style={isMuted ? muteButtonActivedStyles : muteButtonStyles}
          aria-label={isMuted ? `Unmute ${label}` : `Mute ${label}`}
        >
          {isMuted ? 'Muted' : 'Mute'}
        </button>
      </div>
      <div style={volumeRowStyles}>
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          onChange={handleSliderChange}
          disabled={isMuted}
          style={sliderStyles}
          aria-label={`${label} volume`}
        />
        <span style={volumeValueStyles}>{isMuted ? 0 : volume}%</span>
      </div>
    </div>
  );
};

VolumeControl.displayName = 'VolumeControl';

export default VolumeControl;
