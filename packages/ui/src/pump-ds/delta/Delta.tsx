import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

/**
 * Delta — a trend indicator for KPIs, table cells, and metric footers. Shows
 * an up/down/flat arrow and a value string ("12.4%", "−₹1,240", "matched").
 *
 * Direction can be passed explicitly, or auto-derived when `value` is a
 * numeric string starting with '+', '-', or a digit. Use `invert` for
 * "down-is-good" metrics (falling outstanding, shrinking variance) — the
 * arrow direction stays truthful but the tone flips.
 */

export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaSize = 'xs' | 'sm' | 'md';

const deltaVariants = cva(
  [
    'inline-flex items-center gap-1 font-mono font-semibold leading-none rounded whitespace-nowrap',
    'transition-colors',
  ].join(' '),
  {
    variants: {
      size: {
        xs: 'h-[16px] px-[5px] text-[10px] [&_svg]:size-[7px]',
        sm: 'h-[18px] px-1.5 text-[11px] [&_svg]:size-2',
        md: 'h-[22px] px-2 text-[12px] [&_svg]:size-2.5',
      },
      tone: {
        // Auto-tone: derived from `direction` × `invert`.
        up:      'bg-success-bg text-success-fg',
        down:    'bg-danger-bg text-danger-fg',
        flat:    'bg-surface-alt text-ink-muted',
        goodUp:  'bg-success-bg text-success-fg',
        badUp:   'bg-danger-bg text-danger-fg',
        goodDown:'bg-success-bg text-success-fg',
        badDown: 'bg-danger-bg text-danger-fg',
      },
    },
    defaultVariants: { size: 'sm', tone: 'flat' },
  }
);

/**
 * Infer direction from a value string. Returns 'up' when the value starts
 * with '+' or a digit (positive), 'down' when '-' or '−' (unicode minus),
 * 'flat' otherwise. Non-string values are always 'flat' unless overridden.
 */
function inferDirection(value: unknown): DeltaDirection {
  if (typeof value !== 'string' && typeof value !== 'number') return 'flat';
  const s = String(value).trim();
  if (!s) return 'flat';
  if (s.startsWith('-') || s.startsWith('−')) return 'down';
  if (s.startsWith('+')) return 'up';
  // Bare digit → treat as positive (a KPI showing "12.4%" is going up).
  if (/^\d/.test(s)) return 'up';
  return 'flat';
}

export interface DeltaProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    Pick<VariantProps<typeof deltaVariants>, 'size'> {
  /** Text or number rendered after the arrow. */
  value: ReactNode;
  /** Explicit direction. Auto-derived from `value` when omitted. */
  direction?: DeltaDirection;
  /**
   * Flip semantics for "down-is-good" metrics: outstanding falling, variance
   * shrinking, days-overdue trending toward zero. The arrow stays truthful
   * (down still points down); only the tone flips.
   */
  invert?: boolean;
  /** Hide the leading arrow (rare — kept for cases where the sign is inside `value`). */
  showArrow?: boolean;
}

const ArrowUp = (
  <svg viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M4 6.5V1.5M4 1.5L1.5 4M4 1.5L6.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ArrowDown = (
  <svg viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M4 1.5V6.5M4 6.5L1.5 4M4 6.5L6.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DashFlat = (
  <svg viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M1.5 4H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const Delta = forwardRef<HTMLSpanElement, DeltaProps>(function Delta(
  { className, size, value, direction, invert, showArrow = true, ...rest },
  ref
) {
  const dir = direction ?? inferDirection(value);
  // Resolve tone from direction × invert.
  const tone =
    dir === 'flat' ? 'flat'
    : dir === 'up'   ? (invert ? 'badUp'   : 'goodUp')
    :                  (invert ? 'goodDown' : 'badDown');

  const arrow = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : DashFlat;

  return (
    <span
      ref={ref}
      role="status"
      className={cn(deltaVariants({ size, tone }), className)}
      {...rest}
    >
      {showArrow && arrow}
      <span>{value}</span>
    </span>
  );
});
