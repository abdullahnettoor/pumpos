import React from 'react';
import { Button } from '../../pump-ds/index.js';

/**
 * The refetch after a Handover failed, so the shift-level totals it moves are
 * not confirmed (#606 review). Inline and persistent, with Retry; it goes away
 * only when a refetch succeeds. Not a toast.
 */
export const UnconfirmedTotalsNote: React.FC<{ onRetry?: () => void; retrying?: boolean }> = ({
  onRetry,
  retrying,
}) => (
  <div
    role="alert"
    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-danger-fg"
    data-testid="unconfirmed-totals"
  >
    <span>Couldn&apos;t confirm the drawer totals.</span>
    {onRetry && (
      <Button variant="ghost" size="xs" loading={retrying} onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);
