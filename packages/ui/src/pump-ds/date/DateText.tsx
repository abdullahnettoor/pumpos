import React, { forwardRef, type HTMLAttributes } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/format.js';

export type DateVariant = 'full' | 'compact' | 'datetime' | 'time';
export type DateTone = 'default' | 'muted' | 'strong' | 'faint';

export interface DateTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Date-only string (`YYYY-MM-DD`), ISO timestamp, epoch, or Date. */
  value?: string | number | Date | null;
  /** `full` = 11 Jul 2026 (default) · `compact` = 11 Jul 26 · `datetime` · `time`. */
  variant?: DateVariant;
  /** Leading calendar icon — the date signature. Default true. */
  icon?: boolean;
  tone?: DateTone;
  /** Shown when the value is missing/invalid. Default '—'. */
  placeholder?: string;
}

const TONE: Record<DateTone, string> = {
  default: 'text-ink-default',
  muted: 'text-ink-muted',
  strong: 'text-ink-strong',
  faint: 'text-ink-faint',
};

/**
 * DateText — the single, app-wide way to render a date. A subtle leading
 * calendar icon plus the canonical `11 Jul 2026` (en-IN, day-first) format.
 * Replaces the ad-hoc `new Date(x).toLocaleDateString(...)` cells that each
 * rendered dates differently (Jul 11, 2026 / 09 Jul 26 / 11 Jul 2026), so
 * every table, drawer, and header shares one date identity.
 */
export const DateText = forwardRef<HTMLSpanElement, DateTextProps>(function DateText(
  { value, variant = 'full', icon = true, tone = 'default', placeholder = '—', className, ...rest },
  ref,
) {
  const text =
    variant === 'datetime' ? formatDateTime(value, { fallback: placeholder })
    : variant === 'time' ? formatTime(value, { fallback: placeholder })
    : formatDate(value, { compact: variant === 'compact', fallback: placeholder });

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]',
        '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-faint',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon && <Calendar aria-hidden="true" />}
      {text}
    </span>
  );
});
