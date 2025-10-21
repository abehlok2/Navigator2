/**
 * Session error types and error handling utilities
 */

export type SessionError =
  | { type: 'connection-failed'; message: string; canRetry: boolean }
  | { type: 'microphone-denied'; message: string }
  | { type: 'peer-disconnected'; participantName: string }
  | { type: 'audio-load-failed'; filename: string }
  | { type: 'recording-failed'; reason: string };

export type ErrorSeverity = 'error' | 'warning';

export interface ErrorContext {
  error: SessionError;
  severity: ErrorSeverity;
  timestamp: number;
  canRetry: boolean;
  isDismissible: boolean;
}

/**
 * Convert raw errors into SessionError types with user-friendly messages
 */
export function createSessionError(error: unknown, context?: string): SessionError {
  if (error instanceof DOMException) {
    // Microphone permission errors
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return {
        type: 'microphone-denied',
        message: 'Microphone access was denied. Please allow microphone access in your browser settings.',
      };
    }

    if (error.name === 'NotFoundError') {
      return {
        type: 'microphone-denied',
        message: 'No microphone was found. Please connect a microphone and try again.',
      };
    }

    if (error.name === 'NotReadableError') {
      return {
        type: 'microphone-denied',
        message: 'Microphone is already in use by another application. Please close other apps and try again.',
      };
    }
  }

  if (error instanceof Error) {
    // Connection errors
    if (error.message.includes('WebSocket') || error.message.includes('connection')) {
      return {
        type: 'connection-failed',
        message: 'Failed to connect to the session. Please check your internet connection.',
        canRetry: true,
      };
    }

    // Recording errors
    if (context === 'recording') {
      return {
        type: 'recording-failed',
        reason: error.message || 'An unexpected error occurred while recording',
      };
    }

    // Audio loading errors
    if (context === 'audio-load') {
      return {
        type: 'audio-load-failed',
        filename: 'audio file',
      };
    }
  }

  // Default connection error
  return {
    type: 'connection-failed',
    message: 'An unexpected error occurred. Please try again.',
    canRetry: true,
  };
}

/**
 * Determine error severity based on error type
 */
export function getErrorSeverity(error: SessionError): ErrorSeverity {
  switch (error.type) {
    case 'connection-failed':
    case 'microphone-denied':
      return 'error';
    case 'peer-disconnected':
    case 'audio-load-failed':
      return 'warning';
    case 'recording-failed':
      return 'error';
    default:
      return 'error';
  }
}

/**
 * Check if an error can be retried
 */
export function canRetryError(error: SessionError): boolean {
  switch (error.type) {
    case 'connection-failed':
      return error.canRetry;
    case 'microphone-denied':
      return false;
    case 'peer-disconnected':
      return false;
    case 'audio-load-failed':
      return true;
    case 'recording-failed':
      return true;
    default:
      return false;
  }
}

/**
 * Check if an error can be dismissed
 */
export function canDismissError(error: SessionError): boolean {
  switch (error.type) {
    case 'connection-failed':
      return !error.canRetry; // Can dismiss if no retry possible
    case 'microphone-denied':
      return true;
    case 'peer-disconnected':
      return true;
    case 'audio-load-failed':
      return true;
    case 'recording-failed':
      return true;
    default:
      return true;
  }
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: SessionError): string {
  switch (error.type) {
    case 'connection-failed':
      return error.message;
    case 'microphone-denied':
      return error.message;
    case 'peer-disconnected':
      return `${error.participantName} has disconnected from the session.`;
    case 'audio-load-failed':
      return `Failed to load ${error.filename}. Please ensure the file is a valid audio format (MP3, WAV, OGG).`;
    case 'recording-failed':
      return `Recording failed: ${error.reason}`;
    default:
      return 'An unexpected error occurred.';
  }
}

/**
 * Get help text for resolving the error
 */
export function getErrorHelpText(error: SessionError): string | undefined {
  switch (error.type) {
    case 'microphone-denied':
      return 'Click the camera/microphone icon in your browser address bar to allow access.';
    case 'connection-failed':
      return 'Check your internet connection and try again. If the problem persists, try refreshing the page.';
    case 'audio-load-failed':
      return 'Supported formats: MP3, WAV, OGG, AAC. Maximum file size: 50MB.';
    default:
      return undefined;
  }
}

/**
 * Attempt to reconnect to the session with exponential backoff
 */
export async function attemptReconnection(
  maxAttempts: number,
  reconnectFn: () => Promise<void>,
  onAttempt?: (attempt: number, delay: number) => void,
): Promise<boolean> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 15000); // 1s, 2s, 4s, max 15s

    if (onAttempt) {
      onAttempt(attempt, delay);
    }

    try {
      await new Promise(resolve => setTimeout(resolve, delay));
      await reconnectFn();
      return true; // Success
    } catch (error) {
      if (attempt === maxAttempts) {
        return false; // Failed all attempts
      }
      // Continue to next attempt
    }
  }

  return false;
}

/**
 * Handle connection errors with automatic retry logic
 */
export async function handleConnectionError(
  error: SessionError,
  reconnectFn: () => Promise<void>,
  onRetrying?: (attempt: number, delay: number) => void,
  onFailed?: () => void,
): Promise<void> {
  if (error.type !== 'connection-failed' || !error.canRetry) {
    // Not a retryable connection error
    if (onFailed) {
      onFailed();
    }
    return;
  }

  // Attempt reconnection
  const success = await attemptReconnection(3, reconnectFn, onRetrying);

  if (!success && onFailed) {
    onFailed();
  }
}

/**
 * Create error context from SessionError
 */
export function createErrorContext(error: SessionError): ErrorContext {
  return {
    error,
    severity: getErrorSeverity(error),
    timestamp: Date.now(),
    canRetry: canRetryError(error),
    isDismissible: canDismissError(error),
  };
}
