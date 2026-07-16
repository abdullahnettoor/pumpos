import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { Dot, type DotTone } from '../dot/Dot.js';

/**
 * SyncPulse — ambient sync-state indicator for the app-shell top bar. A small
 * pill with a pulsing tone dot and a short label. Replaces the legacy
 * `SyncIndicator`. Reduced-motion users get a static dot (via Dot's
 * motion-safe pulse).
 *
 * Status vocabulary matches AppShell's `syncStatus` prop so it can be dropped
 * in directly.
 */

export type SyncStatus = 'online' | 'offline' | 'synced' | 'pending' | 'failed';

interface SyncMeta {
  tone: DotTone;
  label: string;
  pulse: boolean;
}

function metaFor(status: SyncStatus, pendingCount: number): SyncMeta {
  switch (status) {
    case 'online':
    case 'synced':
      return { tone: 'success', label: 'Live', pulse: true };
    case 'pending':
      return { tone: 'warning', label: pendingCount > 0 ? `Pending ${pendingCount}` : 'Pending', pulse: true };
    case 'failed':
      return { tone: 'danger', label: 'Sync failed', pulse: true };
    case 'offline':
    default:
      return { tone: 'neutral', label: 'Offline', pulse: false };
  }
}

export interface SyncPulseProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: SyncStatus;
  /** Number of unsynced events; shown in the label for `pending`. */
  pendingCount?: number;
  /** Compact variant hides the label, keeping just the dot (for tight bars). */
  compact?: boolean;
}

export const SyncPulse = forwardRef<HTMLSpanElement, SyncPulseProps>(function SyncPulse(
  { className, status, pendingCount = 0, compact = false, ...rest },
  ref
) {
  const meta = metaFor(status, pendingCount);
  return (
    <span
      ref={ref}
      role="status"
      aria-label={`Sync: ${meta.label}`}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border-soft bg-surface text-[11px]',
        compact ? 'w-7 justify-center px-0' : 'px-2',
        className,
      )}
      {...rest}
    >
      <Dot tone={meta.tone} size="sm" pulse={meta.pulse} />
      {!compact && <span className="font-medium text-ink-strong">{meta.label}</span>}
    </span>
  );
});
