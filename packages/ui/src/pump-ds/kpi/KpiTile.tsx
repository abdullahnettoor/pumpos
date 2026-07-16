import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { Dot, type DotTone } from '../dot/Dot.js';
import { Delta, type DeltaDirection } from '../delta/Delta.js';

/**
 * KpiTile — a single compact metric cell. Meant to live inside `KpiStrip`;
 * standalone rendering also works (single-cell strip).
 *
 * Composition: leading tone dot in the label (optional), a monospace value
 * (always right-alignable via `--font-mono`), a trailing delta pill, and a
 * hint string. Value tone can be overridden for metrics that are inherently
 * warning/danger (e.g. Variance shown in `--state-warning-fg`).
 */

/*
 * The tile itself is intentionally featureless — no border, no radius. The
 * parent strip paints the surrounding frame + dividers.
 */
const kpiTileVariants = cva(
  'flex min-w-0 flex-col gap-1 bg-surface px-3.5 py-3',
  {
    variants: {
      size: {
        sm: '[&_.kpi-value]:text-[18px]',
        md: '[&_.kpi-value]:text-[20px]',
        lg: '[&_.kpi-value]:text-[24px]',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface KpiTileProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof kpiTileVariants> {
  /** Short caps label ("Sales today", "Variance", "Pending sync"). */
  label: ReactNode;
  /** The metric value. Rendered in mono; prefer pre-formatted currency strings. */
  value: ReactNode;
  /** Leading tone dot next to the label. */
  dot?: DotTone;
  /** Trailing delta pill. Pass a full `direction` when the value isn't obvious. */
  delta?: {
    value: ReactNode;
    direction?: DeltaDirection;
    invert?: boolean;
  };
  /** Hint text next to the delta ("vs yest.", "7d", "2 tanks over 0.5%"). */
  hint?: ReactNode;
  /** Override the value color (e.g. show Variance's `-₹1,240` in warning fg). */
  valueTone?: DotTone;
}

const TONE_TEXT: Record<DotTone, string> = {
  brand:   'text-brand',
  info:    'text-info-fg',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger:  'text-danger-fg',
  neutral: 'text-ink-strong',
};

export const KpiTile = forwardRef<HTMLDivElement, KpiTileProps>(function KpiTile(
  { className, size, label, value, dot, delta, hint, valueTone, ...rest },
  ref
) {
  return (
    <div ref={ref} className={cn(kpiTileVariants({ size }), className)} {...rest}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {dot && <Dot tone={dot} size="sm" />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'kpi-value font-mono font-semibold leading-tight tracking-[-0.01em] truncate',
          valueTone ? TONE_TEXT[valueTone] : 'text-ink-strong',
        )}
      >
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
          {delta && <Delta value={delta.value} direction={delta.direction} invert={delta.invert} size="xs" />}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
});
