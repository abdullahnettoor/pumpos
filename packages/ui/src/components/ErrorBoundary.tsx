import React from 'react';
import { Button } from '../pump-ds/index.js';

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
    // oxlint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6 font-sans">
        <div className="flex w-full max-w-110 flex-col gap-4 rounded-card border border-border-soft bg-surface p-6 text-center">
          <h1 className="text-[18px] font-bold text-ink-strong">Something went wrong</h1>
          <p className="text-[13px] leading-[1.5] text-ink-muted">
            An unexpected error interrupted this screen. Your data is safe — reloading usually
            clears it.
          </p>
          <pre className="max-h-30 overflow-auto whitespace-pre-wrap break-words rounded-input bg-danger-bg p-3 text-left font-mono text-[12px] text-danger-fg">
            {error.message}
          </pre>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={this.reset}>
              Try again
            </Button>
            <Button variant="primary" size="md" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
