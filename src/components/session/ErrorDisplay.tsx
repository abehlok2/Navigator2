import type { FC } from 'react';
import { useEffect, useState } from 'react';
import type { SessionError, ErrorSeverity } from '../../features/webrtc/errors';
import {
  getErrorMessage,
  getErrorHelpText,
  canRetryError,
  canDismissError,
  getErrorSeverity,
} from '../../features/webrtc/errors';
import { Button } from '../ui/Button';
import '../../styles/error-display.css';

export interface ErrorDisplayProps {
  error: SessionError;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryCountdown?: number;
}

const getSeverityIcon = (severity: ErrorSeverity): string => {
  switch (severity) {
    case 'error':
      return '⚠';
    case 'warning':
      return 'ℹ';
    default:
      return '⚠';
  }
};

export const ErrorDisplay: FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  retryCountdown,
}) => {
  const severity = getErrorSeverity(error);
  const message = getErrorMessage(error);
  const helpText = getErrorHelpText(error);
  const canRetry = canRetryError(error);
  const canDismiss = canDismissError(error);

  const [countdown, setCountdown] = useState(retryCountdown);

  useEffect(() => {
    if (retryCountdown !== undefined && retryCountdown > 0) {
      setCountdown(retryCountdown);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === undefined || prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [retryCountdown]);

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`error-display error-display--${severity}`}
    >
      <div className="error-display__content">
        <div className="error-display__icon" aria-hidden="true">
          {getSeverityIcon(severity)}
        </div>
        <div className="error-display__message-container">
          <div className="error-display__message">{message}</div>
          {helpText && <div className="error-display__help">{helpText}</div>}
          {countdown !== undefined && countdown > 0 && (
            <div className="error-display__countdown">
              Retrying in {countdown} second{countdown !== 1 ? 's' : ''}...
            </div>
          )}
        </div>
      </div>
      <div className="error-display__actions">
        {canRetry && onRetry && (
          <Button
            variant="primary"
            onClick={handleRetry}
            disabled={countdown !== undefined && countdown > 0}
            ariaLabel="Retry connection"
          >
            {countdown !== undefined && countdown > 0
              ? `Retry (${countdown}s)`
              : 'Retry'}
          </Button>
        )}
        {canDismiss && onDismiss && (
          <Button
            variant="secondary"
            onClick={handleDismiss}
            ariaLabel="Dismiss error"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
};

ErrorDisplay.displayName = 'ErrorDisplay';

export default ErrorDisplay;
