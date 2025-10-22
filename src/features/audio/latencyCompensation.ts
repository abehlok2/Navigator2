import type { ControlChannel } from '../webrtc/ControlChannel';
import type { LatencyPongMessage } from '../../types/control-messages';

/**
 * LatencyCompensator measures and compensates for network latency
 * to enable synchronized audio playback across participants.
 */
export class LatencyCompensator {
  private estimatedLatency: number = 0;
  private measurements: number[] = [];
  private readonly MAX_MEASUREMENTS = 10;

  /**
   * Measures round-trip time (RTT) to estimate network latency.
   * Sends a ping message and waits for a pong response.
   *
   * @param controlChannel The control channel to use for measurement
   * @returns Promise that resolves with the estimated latency in milliseconds
   */
  async measureLatency(controlChannel: ControlChannel): Promise<number> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const pingId = Math.random().toString(36).substring(2, 15);

      const handlePong = (message: LatencyPongMessage) => {
        if (message.pingId === pingId) {
          const rtt = Date.now() - startTime;
          this.addMeasurement(rtt);
          controlChannel.off('latency:pong', handlePong);
          resolve(this.estimatedLatency);
        }
      };

      controlChannel.on('latency:pong', handlePong);
      controlChannel.send('latency:ping', { pingId });

      // Timeout after 5 seconds
      setTimeout(() => {
        controlChannel.off('latency:pong', handlePong);
        resolve(this.estimatedLatency);
      }, 5000);
    });
  }

  /**
   * Adds a new RTT measurement and recalculates the estimated latency.
   * Uses outlier removal to improve accuracy.
   *
   * @param rtt Round-trip time in milliseconds
   */
  private addMeasurement(rtt: number): void {
    this.measurements.push(rtt);

    if (this.measurements.length > this.MAX_MEASUREMENTS) {
      this.measurements.shift();
    }

    // Calculate average, removing outliers
    const sorted = [...this.measurements].sort((a, b) => a - b);

    // Only remove outliers if we have more than 3 measurements
    // to avoid empty array from slice(1, -1)
    let trimmed: number[];
    if (sorted.length > 3) {
      trimmed = sorted.slice(1, -1); // Remove highest and lowest
    } else {
      trimmed = sorted; // Use all measurements if we have 3 or fewer
    }

    const sum = trimmed.reduce((a, b) => a + b, 0);
    this.estimatedLatency = trimmed.length > 0 ? sum / trimmed.length / 2 : 0; // Half of RTT
  }

  /**
   * Gets the current estimated latency.
   *
   * @returns Estimated one-way latency in milliseconds
   */
  getEstimatedLatency(): number {
    return this.estimatedLatency;
  }

  /**
   * Compensates a remote timestamp for latency.
   * Useful for synchronizing time-sensitive events like audio playback.
   *
   * @param remoteTimestamp Timestamp received from remote peer
   * @returns Compensated timestamp adjusted for estimated latency
   */
  compensateTimestamp(remoteTimestamp: number): number {
    return remoteTimestamp + this.estimatedLatency;
  }
}
