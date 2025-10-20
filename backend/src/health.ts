export type HealthStatus = 'ok' | 'error';

export interface HealthSnapshot {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  connections: number;
  activeRooms: number;
}

export interface HealthMetricsProvider {
  /**
   * Returns the number of active WebSocket (or other realtime) connections.
   */
  getConnections(): number;
  /**
   * Returns the number of active rooms/sessions currently tracked by the server.
   */
  getActiveRooms(): number;
  /**
   * Optionally determine the overall health state. Defaults to `'ok'`.
   */
  getStatus?(): HealthStatus;
}

export interface HealthHandlerOptions extends HealthMetricsProvider {
  /**
   * Epoch (in milliseconds) representing when the server started.
   * Defaults to the time the handler factory is invoked.
   */
  startedAt?: number;
  /**
   * Optional function that returns the current timestamp in milliseconds.
   * Defaults to `Date.now`.
   */
  now?: () => number;
}

export interface JsonResponse {
  status?(code: number): JsonResponse;
  json(payload: unknown): void;
}

/**
 * Create a standardised health snapshot using the provided metrics and clocks.
 */
export const createHealthSnapshot = (
  metrics: Pick<HealthMetricsProvider, 'getConnections' | 'getActiveRooms' | 'getStatus'>,
  startedAt: number,
  now: () => number
): HealthSnapshot => {
  const current = now();
  const status = metrics.getStatus ? metrics.getStatus() : 'ok';

  return {
    status,
    uptime: (current - startedAt) / 1000,
    timestamp: new Date(current).toISOString(),
    connections: metrics.getConnections(),
    activeRooms: metrics.getActiveRooms(),
  };
};

/**
 * Creates a request handler that responds with the current health snapshot.
 * The handler is compatible with Express style middleware signatures.
 */
export const createHealthHandler = (options: HealthHandlerOptions) => {
  const startedAt = options.startedAt ?? Date.now();
  const now = options.now ?? Date.now;

  return (_req: unknown, res: JsonResponse) => {
    const snapshot = createHealthSnapshot(options, startedAt, now);

    if (res.status) {
      res.status(snapshot.status === 'ok' ? 200 : 503);
    }

    res.json(snapshot);
  };
};
