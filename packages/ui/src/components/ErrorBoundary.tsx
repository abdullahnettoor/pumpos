import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time exceptions anywhere in the tree
 * and shows a calm, tokenized recovery screen instead of a white page. Wrap the
 * app root with this in each shell (web, desktop).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
          fontFamily: 'var(--font-sans)',
          backgroundColor: 'var(--bg-canvas)',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>Something went wrong</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            An unexpected error interrupted this screen. Your data is safe — reloading usually clears it.
          </p>
          <pre
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--state-danger-fg)',
              backgroundColor: 'var(--state-danger-bg)',
              borderRadius: 'var(--radius-input)',
              padding: 'var(--space-3)',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '120px',
              overflow: 'auto',
            }}
          >
            {error.message}
          </pre>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
            <button className="btn btn-secondary btn-md" onClick={this.reset}>
              Try again
            </button>
            <button className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
