import type { CSSProperties, FC } from 'react';
import { useEffect, useState } from 'react';

import type { ConnectionMonitor, ConnectionQuality as QualityType, ConnectionStats } from '../../features/webrtc';

export interface ConnectionQualityProps {
  monitor: ConnectionMonitor | null;
}

type QualityConfig = {
  label: string;
  color: string;
  backgroundColor: string;
};

type QualityConfigMap = Record<QualityType, QualityConfig>;

const wrapperStyles: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
  borderRadius: '0.5rem',
  backgroundColor: 'var(--bg-secondary, #1f1f1f)',
  border: '1px solid var(--border, #333)',
  fontSize: '0.9rem',
};

const headerStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontWeight: 500,
};

const indicatorStyles: CSSProperties = {
  width: '0.75rem',
  height: '0.75rem',
  borderRadius: '50%',
  display: 'inline-block',
};

const statsContainerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary, #a0a0a0)',
  marginTop: '0.25rem',
};

const statRowStyles: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
};

const statLabelStyles: CSSProperties = {
  color: 'var(--text-tertiary, #707070)',
};

const qualityConfig: QualityConfigMap = {
  excellent: {
    label: 'Excellent',
    color: 'var(--success, #22c55e)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  good: {
    label: 'Good',
    color: 'var(--warning-light, #facc15)',
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
  },
  poor: {
    label: 'Poor',
    color: 'var(--warning, #f97316)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  critical: {
    label: 'Critical',
    color: 'var(--error, #ef4444)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
};

/**
 * ConnectionQuality Component
 *
 * Displays real-time WebRTC connection quality metrics:
 * - Quality indicator (excellent/good/poor/critical)
 * - Latency (always shown)
 * - Packet loss (shown when quality is poor or critical)
 * - Bitrate (always shown)
 *
 * Auto-updates every 5 seconds when monitor is active
 */
export const ConnectionQuality: FC<ConnectionQualityProps> = ({ monitor }) => {
  const [stats, setStats] = useState<ConnectionStats | null>(null);

  useEffect(() => {
    if (!monitor) {
      setStats(null);
      return;
    }

    // Get initial stats
    const getInitialStats = async () => {
      try {
        const initialStats = monitor.getLastStats();
        if (initialStats) {
          setStats(initialStats);
        } else {
          // If no cached stats, fetch fresh ones
          const freshStats = await monitor.getStats();
          setStats(freshStats);
        }
      } catch (error) {
        console.error('[ConnectionQuality] Failed to get initial stats:', error);
      }
    };

    getInitialStats();

    // Set up interval to update stats every 5 seconds
    const intervalId = setInterval(async () => {
      try {
        const latestStats = await monitor.getStats();
        setStats(latestStats);
      } catch (error) {
        console.error('[ConnectionQuality] Failed to update stats:', error);
      }
    }, 5000);

    // Listen for quality changes
    const handleQualityChange = (quality: QualityType) => {
      // Update stats immediately when quality changes
      monitor.getStats().then(setStats).catch(console.error);
    };

    monitor.on('quality-change', handleQualityChange);

    return () => {
      clearInterval(intervalId);
      monitor.off('quality-change', handleQualityChange);
    };
  }, [monitor]);

  if (!stats) {
    return (
      <div style={wrapperStyles} role="status" aria-live="polite">
        <div style={headerStyles}>
          <span style={{ ...indicatorStyles, backgroundColor: 'var(--text-tertiary, #707070)' }} aria-hidden="true" />
          <span>No connection data</span>
        </div>
      </div>
    );
  }

  const {
    quality,
    latency,
    packetLoss,
    bitrate,
    outboundAudioBitrate,
    outboundAudioPacketRate,
    outboundAudioMuted,
    outboundAudioEnabled,
    outboundAudioTrackId,
  } = stats;
  const config = qualityConfig[quality];
  const showPacketLoss = quality === 'poor' || quality === 'critical';
  const showOutboundAudio =
    typeof outboundAudioBitrate === 'number' && typeof outboundAudioPacketRate === 'number';

  let outboundAudioSummary = '';
  if (showOutboundAudio) {
    const parts: string[] = [
      formatBitrate(outboundAudioBitrate ?? 0),
      `${(outboundAudioPacketRate ?? 0).toFixed(2)} pkt/s`,
    ];

    if (typeof outboundAudioMuted === 'boolean') {
      parts.push(outboundAudioMuted ? 'muted' : 'unmuted');
    }

    if (typeof outboundAudioEnabled === 'boolean' && outboundAudioEnabled === false) {
      parts.push('disabled');
    }

    if (outboundAudioTrackId) {
      const trackLabel = outboundAudioTrackId.length > 8
        ? `${outboundAudioTrackId.slice(0, 8)}…`
        : outboundAudioTrackId;
      parts.push(`track ${trackLabel}`);
    }

    outboundAudioSummary = parts.join(' • ');
  }

  return (
    <div
      style={{
        ...wrapperStyles,
        backgroundColor: config.backgroundColor,
        borderColor: config.color,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={headerStyles}>
        <span
          style={{
            ...indicatorStyles,
            backgroundColor: config.color,
          }}
          aria-hidden="true"
        />
        <span style={{ color: config.color }}>{config.label}</span>
      </div>

      <div style={statsContainerStyles}>
        <div style={statRowStyles}>
          <span style={statLabelStyles}>Latency:</span>
          <span>{latency}ms</span>
        </div>

        {showPacketLoss && (
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Packet Loss:</span>
            <span>{packetLoss.toFixed(2)}%</span>
          </div>
        )}

        <div style={statRowStyles}>
          <span style={statLabelStyles}>Bitrate:</span>
          <span>{formatBitrate(bitrate)}</span>
        </div>

        {showOutboundAudio && (
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Outbound audio:</span>
            <span>{outboundAudioSummary}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Format bitrate into human-readable format
 */
function formatBitrate(bps: number): string {
  if (bps === 0) return '0 bps';

  const kbps = bps / 1000;
  if (kbps < 1000) {
    return `${kbps.toFixed(1)} kbps`;
  }

  const mbps = kbps / 1000;
  return `${mbps.toFixed(2)} Mbps`;
}

ConnectionQuality.displayName = 'ConnectionQuality';

export default ConnectionQuality;
