import React, { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { StatusChip } from '../chip/index.js';

/**
 * BusinessDayChip — the always-visible business-day anchor for the top bar.
 * Shows the current business date and its open/closed state; clicking opens
 * the day menu (open/close, jump to DSSR). The business day is PumpOS's
 * universal record anchor, so it earns a permanent, prominent slot.
 */

export interface BusinessDayChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Formatted date label, e.g. "09 Jul". */
  date: string;
  status: 'open' | 'closed';
}

export const BusinessDayChip = forwardRef<HTMLButtonElement, BusinessDayChipProps>(function BusinessDayChip(
  { className, date, status, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-button border border-border-soft bg-surface px-2.5 text-[12px] transition-colors hover:bg-surface-alt',
        className,
      )}
      {...props}
    >
      <Calendar className="size-3.5 text-ink-muted" />
      <span className="font-medium text-ink-strong">{date}</span>
      <StatusChip status={status} size="xs" showIcon={false} pulse={status === 'open'} />
      <ChevronDown className="size-3.5 text-ink-faint" />
    </button>
  );
});
