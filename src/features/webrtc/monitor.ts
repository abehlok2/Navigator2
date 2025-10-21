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
        totalBytesSent += stat.bytesSent || 0;
        currentTimestamp = stat.timestamp || now;
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
    };
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
  }
}
