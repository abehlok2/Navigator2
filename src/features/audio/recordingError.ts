export type RecorderErrorEvent = Event & { error?: DOMException };

export class RecordingError extends Error {
  public readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'RecordingError';
    this.originalError = originalError;
  }
}
