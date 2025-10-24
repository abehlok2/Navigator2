/**
 * WebRTC Connection Monitor
 * Monitors RTCPeerConnection stats and emits quality change events
 */

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'critical';

export interface ConnectionStats {
  latency: number;
  packetLoss: number;
  bitrate: number;
  quality: ConnectionQuality;
  outboundAudioBitrate?: number;
  outboundAudioPacketRate?: number;
  outboundAudioTrackId?: string;
  outboundAudioMuted?: boolean;
  outboundAudioEnabled?: boolean;
}

type QualityChangeHandler = (quality: ConnectionQuality) => void;

interface QualityThresholds {
  excellent: { latency: number; packetLoss: number };
  good: { latency: number; packetLoss: number };
  poor: { latency: number; packetLoss: number };
}

const QUALITY_THRESHOLDS: QualityThresholds = {
  excellent: { latency: 150, packetLoss: 1 },
  good: { latency: 300, packetLoss: 3 },
  poor: { latency: 500, packetLoss: 5 },
};

/**
 * Monitors WebRTC connection quality and provides real-time stats
 */
export class ConnectionMonitor {
  private pc: RTCPeerConnection;
  private monitoringInterval: number | null = null;
  private qualityChangeHandlers: Set<QualityChangeHandler> = new Set();
  private lastQuality: ConnectionQuality | null = null;
  private lastStats: ConnectionStats | null = null;

  // Previous stats for calculating deltas
  private previousStats: {
    timestamp: number;
    bytesSent: number;
    bytesReceived: number;
    packetsLost: number;
    packetsReceived: number;
  } | null = null;
  private previousOutboundAudio: {
    timestamp: number;
    bytesSent: number;
    packetsSent: number;
  } | null = null;
  private consecutiveSilentOutboundIntervals = 0;
  private lastOutboundAudioLogState: 'active' | 'silent' | null = null;

  constructor(peerConnection: RTCPeerConnection) {
    this.pc = peerConnection;
  }

  /**
   * Start monitoring the connection (updates every 5 seconds)
   */
  startMonitoring(): void {
    if (this.monitoringInterval !== null) {
      return; // Already monitoring
    }

    // Immediate stats collection
    this.collectStats();

    // Set up periodic collection (every 5 seconds)
    this.monitoringInterval = window.setInterval(() => {
      this.collectStats();
    }, 5000);
  }

  /**
   * Stop monitoring the connection
   */
  stopMonitoring(): void {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Get the latest connection stats
   */
  async getStats(): Promise<ConnectionStats> {
    const stats = await this.collectStatsFromPeerConnection();
    return stats;
  }

  /**
   * Register a handler for quality change events
   */
  on(event: 'quality-change', handler: QualityChangeHandler): void {
    if (event === 'quality-change') {
      this.qualityChangeHandlers.add(handler);
    }
  }

  /**
   * Unregister a quality change handler
   */
  off(event: 'quality-change', handler: QualityChangeHandler): void {
    if (event === 'quality-change') {
      this.qualityChangeHandlers.delete(handler);
    }
  }

  /**
   * Collect stats and emit quality change if needed
   */
  private async collectStats(): Promise<void> {
    try {
      const stats = await this.collectStatsFromPeerConnection();
      this.lastStats = stats;

      // Check if quality changed
      if (stats.quality !== this.lastQuality) {
        this.lastQuality = stats.quality;
        this.emitQualityChange(stats.quality);
      }
    } catch (error) {
      console.error('[ConnectionMonitor] Failed to collect stats:', error);
    }
  }

  /**
   * Collect stats from RTCPeerConnection
   */
  private async collectStatsFromPeerConnection(): Promise<ConnectionStats> {
    const statsReport = await this.pc.getStats();

    let latency = 0;
    let packetLoss = 0;
    let bitrate = 0;

    const now = Date.now();
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;
    let totalBytesSent = 0;
    let totalBytesReceived = 0;
    let currentTimestamp = 0;

    const audioSender = this.pc
      .getSenders()
      .find((sender) => sender.track && sender.track.kind === 'audio');
    const audioTrack = audioSender?.track ?? null;
    const audioTrackId = audioTrack?.id;
    const audioTrackMuted = audioTrack?.muted;
    const audioTrackEnabled = audioTrack?.enabled;

    let outboundAudioStats: { bytesSent: number; packetsSent: number; timestamp: number } | null =
      null;

    // Iterate through stats report
    statsReport.forEach((stat) => {
      // Inbound RTP stream stats (for receiving data)
      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        totalPacketsLost += stat.packetsLost || 0;
        totalPacketsReceived += stat.packetsReceived || 0;
        totalBytesReceived += stat.bytesReceived || 0;
        currentTimestamp = stat.timestamp || now;
      }

      // Outbound RTP stream stats (for sending data)
      if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
        const bytesSent = stat.bytesSent || 0;
        totalBytesSent += bytesSent;
        currentTimestamp = stat.timestamp || now;
        outboundAudioStats = {
          bytesSent,
          packetsSent: stat.packetsSent || 0,
          timestamp: stat.timestamp || now,
        };
      }

      // Candidate pair stats (for latency)
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        latency = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0; // Convert to ms
      }

      // Remote inbound RTP stats (can also provide RTT)
      if (stat.type === 'remote-inbound-rtp') {
        if (stat.roundTripTime !== undefined) {
          latency = stat.roundTripTime * 1000; // Convert to ms
        }
      }
    });

    // Calculate packet loss percentage
    const totalPackets = totalPacketsReceived + totalPacketsLost;
    if (totalPackets > 0) {
      packetLoss = (totalPacketsLost / totalPackets) * 100;
    }

    // Calculate bitrate (bits per second)
    if (this.previousStats && currentTimestamp > this.previousStats.timestamp) {
      const timeDelta = (currentTimestamp - this.previousStats.timestamp) / 1000; // Convert to seconds
      const bytesDelta =
        (totalBytesSent - this.previousStats.bytesSent) +
        (totalBytesReceived - this.previousStats.bytesReceived);

      bitrate = (bytesDelta * 8) / timeDelta; // Convert bytes to bits
    }

    let outboundAudioBitrate = 0;
    let outboundAudioPacketRate = 0;

    if (outboundAudioStats) {
      if (this.previousOutboundAudio) {
        const timestampDelta = outboundAudioStats.timestamp - this.previousOutboundAudio.timestamp;

        if (timestampDelta > 0) {
          const timeDeltaSeconds = timestampDelta / 1000;
          const bytesDelta = outboundAudioStats.bytesSent - this.previousOutboundAudio.bytesSent;
          const packetsDelta =
            outboundAudioStats.packetsSent - this.previousOutboundAudio.packetsSent;

          if (timeDeltaSeconds > 0) {
            outboundAudioBitrate = Math.max(0, (bytesDelta * 8) / timeDeltaSeconds);
            outboundAudioPacketRate = Math.max(0, packetsDelta / timeDeltaSeconds);
            this.evaluateOutboundAudioState(
              outboundAudioBitrate,
              outboundAudioPacketRate,
              audioTrackId,
              audioTrackMuted,
              audioTrackEnabled,
            );
          }
        }
      } else {
        const trackMessage = audioTrackId ? ` for track ${audioTrackId}` : '';
        console.log(`[ConnectionMonitor] Initialized outbound audio tracking${trackMessage}`);
      }

      this.previousOutboundAudio = outboundAudioStats;
    } else {
      this.previousOutboundAudio = null;
      this.consecutiveSilentOutboundIntervals = 0;
      this.lastOutboundAudioLogState = null;
    }

    // Update previous stats for next calculation
    this.previousStats = {
      timestamp: currentTimestamp,
      bytesSent: totalBytesSent,
      bytesReceived: totalBytesReceived,
      packetsLost: totalPacketsLost,
      packetsReceived: totalPacketsReceived,
    };

    // Determine quality based on thresholds
    const quality = this.calculateQuality(latency, packetLoss);

    return {
      latency: Math.round(latency),
      packetLoss: Math.round(packetLoss * 100) / 100, // Round to 2 decimal places
      bitrate: Math.round(bitrate),
      quality,
      outboundAudioBitrate: outboundAudioStats ? Math.round(outboundAudioBitrate) : undefined,
      outboundAudioPacketRate: outboundAudioStats
        ? Math.round(outboundAudioPacketRate * 100) / 100
        : undefined,
      outboundAudioTrackId: audioTrackId,
      outboundAudioMuted: audioTrackMuted,
      outboundAudioEnabled: audioTrackEnabled,
    };
  }

  private evaluateOutboundAudioState(
    bitrate: number,
    packetRate: number,
    trackId?: string,
    muted?: boolean,
    enabled?: boolean,
  ): void {
    const packetRateLabel = Number.isFinite(packetRate) ? packetRate.toFixed(2) : '0.00';
    const isSilent = bitrate < 100 || packetRate === 0;
    const roundedBitrate = Math.round(bitrate);
    const trackLabel = trackId ?? 'unknown';
    const mutedLabel = typeof muted === 'boolean' ? (muted ? 'muted' : 'unmuted') : 'unknown';
    const enabledLabel =
      typeof enabled === 'boolean' ? (enabled ? 'enabled' : 'disabled') : 'unknown';

    if (isSilent) {
      this.consecutiveSilentOutboundIntervals += 1;

      if (this.consecutiveSilentOutboundIntervals >= 2 && this.lastOutboundAudioLogState !== 'silent') {
        console.warn(
          `[ConnectionMonitor] ⚠️ No outbound audio detected from facilitator (bitrate=${roundedBitrate}bps, packets/s=${packetRateLabel}, track=${trackLabel}, muted=${mutedLabel}, enabled=${enabledLabel})`,
        );
        this.lastOutboundAudioLogState = 'silent';
      }
    } else {
      if (this.lastOutboundAudioLogState !== 'active') {
        console.log(
          `[ConnectionMonitor] ✓ Outbound audio flowing (bitrate=${roundedBitrate}bps, packets/s=${packetRateLabel}${trackId ? `, track=${trackLabel}` : ''}, muted=${mutedLabel}, enabled=${enabledLabel})`,
        );
      }

      this.consecutiveSilentOutboundIntervals = 0;
      this.lastOutboundAudioLogState = 'active';
    }
  }

  /**
   * Calculate connection quality based on latency and packet loss
   */
  private calculateQuality(latency: number, packetLoss: number): ConnectionQuality {
    const { excellent, good, poor } = QUALITY_THRESHOLDS;

    if (latency < excellent.latency && packetLoss < excellent.packetLoss) {
      return 'excellent';
    }

    if (latency < good.latency && packetLoss < good.packetLoss) {
      return 'good';
    }

    if (latency < poor.latency && packetLoss < poor.packetLoss) {
      return 'poor';
    }

    return 'critical';
  }

  /**
   * Emit quality change event to all handlers
   */
  private emitQualityChange(quality: ConnectionQuality): void {
    this.qualityChangeHandlers.forEach((handler) => {
      try {
        handler(quality);
      } catch (error) {
        console.error('[ConnectionMonitor] Error in quality change handler:', error);
      }
    });
  }

  /**
   * Get the last collected stats (synchronous)
   */
  getLastStats(): ConnectionStats | null {
    return this.lastStats;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.qualityChangeHandlers.clear();
    this.lastStats = null;
    this.lastQuality = null;
    this.previousStats = null;
    this.previousOutboundAudio = null;
    this.consecutiveSilentOutboundIntervals = 0;
    this.lastOutboundAudioLogState = null;
  }
}
