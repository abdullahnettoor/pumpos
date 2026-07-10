import React, { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

/**
 * Dot — the atomic tone marker. A tiny colored circle that carries meaning
 * through its `tone`, optionally pulses to signal live activity, and comes in
 * four sizes for the contexts it lives in (chip prefix → KPI label → tab
 * corner → prominent status pin).
 *
 * Used as a leaf inside Chip, KpiTile, list rows, and anywhere a full status
 * chip would be too heavy but a bare "state exists" cue helps.
 */

export type DotTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type DotSize = 'xs' | 'sm' | 'md' | 'lg';

const dotVariants = cva(
  'inline-block shrink-0 rounded-full',
  {
    variants: {
      size: {
        xs: 'size-1',      // 4px  — inline with 10-11px text
        sm: 'size-1.5',    // 6px  — default; matches chip prefix + row leaders
        md: 'size-2',      // 8px  — KPI labels, tabs, prominent hints
        lg: 'size-2.5',    // 10px — page-level status pin
      },
      tone: {
        brand:   'bg-brand',
        info:    'bg-info-fg',
        success: 'bg-success-fg',
        warning: 'bg-warning-fg',
        danger:  'bg-danger-fg',
        neutral: 'bg-ink-faint',
      },
    },
    defaultVariants: { size: 'sm', tone: 'neutral' },
  }
);

export interface DotProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof dotVariants> {
  /** Animate a soft opacity pulse to signal live / ongoing state. */
  pulse?: boolean;
}

export const Dot = forwardRef<HTMLSpanElement, DotProps>(function Dot(
  { className, tone, size, pulse, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(dotVariants({ tone, size }), pulse && 'motion-safe:animate-pulse', className)}
      {...rest}
    />
  );
});
