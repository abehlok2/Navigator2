import { Component, ErrorInfo, ReactNode } from 'react';
import { Card, Button } from './ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            backgroundColor: 'var(--color-surface-muted, #f3f4f6)',
          }}
        >
          <Card title="Something went wrong">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, color: 'var(--color-text-secondary, #666)' }}>
                An unexpected error occurred. You can try to recover by clicking the button below.
              </p>
              {this.state.error && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--color-danger, #dc2626)' }}>
                    Error details
                  </summary>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '0.25rem',
                      overflow: 'auto',
                      fontSize: '0.875rem',
                    }}
                  >
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              <Button onClick={this.handleReset}>Try Again</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = '/';
                }}
              >
                Return to Login
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
