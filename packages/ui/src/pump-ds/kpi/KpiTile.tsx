import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { Delta, type DeltaDirection } from '../delta/Delta.js';
import { kpiTileChip, type KpiScope } from './scope.js';
import { useKpiStripScope } from './context.js';

/**
 * KpiTile — one headline figure (#567). Lives inside `KpiStrip`, which paints
 * the frame and the dividers; the tile itself has no border or radius.
 *
 * - A 12px sentence-case label, with the period chip (`scope`) at its right
 *   only where it tells the reader something (#604): never on a balance
 *   (`now`), and never when the strip already names the period.
 * - A plain mono value. Ordinary money is never coloured.
 * - `alert` is the only way a tile shows colour, and only for a problem
 *   (Overdue, Over limit, a negative net): a coloured left edge plus the value
 *   in that tone.
 * - An optional comparison line: `delta`, then `hint` ("vs Sep, same days").
 */

const kpiTileVariants = cva('flex min-w-0 flex-col gap-1 bg-surface px-3.5 py-3', {
  variants: {
    size: {
      sm: '[&_.kpi-value]:text-[18px]',
      md: '[&_.kpi-value]:text-[20px]',
      lg: '[&_.kpi-value]:text-[24px]',
    },
    alert: {
      none: '',
      warning: 'shadow-[inset_3px_0_0_var(--color-warning-fg)]',
      danger: 'shadow-[inset_3px_0_0_var(--color-danger-fg)]',
    },
  },
  defaultVariants: { size: 'md', alert: 'none' },
});

export type KpiAlert = 'warning' | 'danger';

export interface KpiTileProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, 'children'>,
    Pick<VariantProps<typeof kpiTileVariants>, 'size'> {
  /** Sentence case ("Spent today", "Over credit limit"). */
  label: ReactNode;
  /** The figure, pre-formatted (`inr(…)`, `formatQuantity(…)`). */
  value: ReactNode;
  /**
   * The period the figure covers: Today · a month (Oct) · a range (1–15 Oct 2026) · This
   * shift · `now` for a balance (never shown). The chip is dropped when the
   * strip's `scope` names the same period.
   */
  scope?: KpiScope;
  /** Colour the tile for a problem only. Never for ordinary money. */
  alert?: KpiAlert;
  /**
   * Comparison with an earlier period. `neutral` for figures where up or down
   * is neither good nor bad (spend); `invert` where down is good.
   */
  delta?: {
    value: ReactNode;
    direction?: DeltaDirection;
    invert?: boolean;
    neutral?: boolean;
  };
  /** Context after the delta ("vs Sep, same days", "3 entries"). */
  hint?: ReactNode;
}

const ALERT_TEXT: Record<KpiAlert, string> = {
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
};

export const KpiTile = forwardRef<HTMLDivElement, KpiTileProps>(function KpiTile(
  { className, size, label, value, scope, alert, delta, hint, ...rest },
  ref,
) {
  const chip = kpiTileChip(scope, useKpiStripScope());
  return (
    <div
      ref={ref}
      data-alert={alert}
      className={cn(kpiTileVariants({ size, alert: alert ?? 'none' }), className)}
      {...rest}
    >
      {/* Chip height, chip or not: values line up across a mixed strip (#604). */}
      <div className="flex min-h-5 min-w-0 items-center gap-1.5 text-[12px] font-medium text-ink-muted">
        <span className="truncate">{label}</span>
        {chip && (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-sm border border-border-soft bg-surface-alt px-1.5 text-[12px] leading-normal text-ink-muted">
            {chip}
          </span>
        )}
      </div>
      <div
        className={cn(
          'kpi-value truncate font-mono font-semibold leading-tight tracking-[-0.01em]',
          alert ? ALERT_TEXT[alert] : 'text-ink-strong',
        )}
      >
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
          {delta && (
            <Delta
              value={delta.value}
              direction={delta.direction}
              invert={delta.invert}
              neutral={delta.neutral}
              size="md"
            />
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
});
