import React from 'react';

/**
 * The one card a screen or block uses to say it has no figures to show (Insights'
 * blocks and screen): loading (announced politely), an error with Retry, or an empty state.
 */
export const StateCard: React.FC<{
  kind: 'loading' | 'error' | 'empty';
  children: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}> = ({ kind, children, onRetry, className = 'px-3 py-4' }) => (
  <div
    role={kind === 'loading' ? 'status' : kind === 'error' ? 'alert' : undefined}
    className={`mx-3 rounded-[14px] border text-center text-xs ${className} ${
      kind === 'error'
        ? 'border-bad-line bg-bad-soft text-bad-fg'
        : 'border-line bg-card text-text-muted'
    }`}
  >
    {children}
    {kind === 'error' && onRetry && (
      <>
        {' '}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      </>
    )}
  </div>
);
