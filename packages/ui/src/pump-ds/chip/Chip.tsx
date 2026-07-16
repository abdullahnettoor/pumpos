import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * PumpOS Chip primitive — the first-class citizen for **status**, **tags**,
 * **counts**, and any short piece of tone-carrying metadata. Every color
 * routes through the token bridge in `pump-ds/tailwind.css`, so a Chip
 * automatically follows theme changes made to `--brand-primary` /
 * `--state-*` in `packages/ui/src/index.css`.
 *
 * Three variants × six tones × three sizes = the full grid. Ships with:
 *   - optional leading icon OR leading tone dot (pick one)
 *   - optional pulse animation on the dot (honors `prefers-reduced-motion`)
 *   - optional close button with proper `aria-label` + focus ring
 *
 * For domain-named status pills (Open, Overdue, Synced, Variance, …) use
 * `StatusChip` instead — same primitive underneath, with the PumpOS status
 * vocabulary baked in.
 */

export type ChipTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type ChipVariant = 'soft' | 'outline' | 'solid';
export type ChipSize = 'xs' | 'sm' | 'md';

/*
 * The shape rules apply to every combination. Tone + variant colors are
 * added by `compoundVariants` below.
 */
const chipVariants = cva(
  [
    'inline-flex items-center whitespace-nowrap select-none rounded-chip font-medium',
    'transition-colors',
    // Normalize nested icon sizes without every caller having to size them.
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      size: {
        xs: 'h-5 px-1.5 gap-1 text-[10px] [&_svg]:size-2.5',
        sm: 'h-[22px] px-2 gap-1.5 text-[11px] [&_svg]:size-3',
        md: 'h-6 px-2.5 gap-1.5 text-[12px] [&_svg]:size-3.5',
      },
      variant: {
        soft: '',
        outline: 'bg-transparent border',
        solid: 'text-white',
      },
      tone: {
        brand: '', info: '', success: '', warning: '', danger: '', neutral: '',
      },
    },
    compoundVariants: [
      // --- soft (default): tinted background + tone-fg text ------------
      { variant: 'soft', tone: 'brand',   className: 'bg-brand/10 text-brand' },
      { variant: 'soft', tone: 'info',    className: 'bg-info-bg text-info-fg' },
      { variant: 'soft', tone: 'success', className: 'bg-success-bg text-success-fg' },
      { variant: 'soft', tone: 'warning', className: 'bg-warning-bg text-warning-fg' },
      { variant: 'soft', tone: 'danger',  className: 'bg-danger-bg text-danger-fg' },
      { variant: 'soft', tone: 'neutral', className: 'bg-surface-alt text-ink-muted' },

      // --- outline: transparent + tone-colored border + tone-fg text ----
      { variant: 'outline', tone: 'brand',   className: 'border-brand text-brand' },
      { variant: 'outline', tone: 'info',    className: 'border-info-fg text-info-fg' },
      { variant: 'outline', tone: 'success', className: 'border-success-fg text-success-fg' },
      { variant: 'outline', tone: 'warning', className: 'border-warning-fg text-warning-fg' },
      { variant: 'outline', tone: 'danger',  className: 'border-danger-fg text-danger-fg' },
      { variant: 'outline', tone: 'neutral', className: 'border-border-strong text-ink-default' },

      // --- solid: full-saturation background + white text ---------------
      { variant: 'solid', tone: 'brand',   className: 'bg-brand' },
      { variant: 'solid', tone: 'info',    className: 'bg-info-fg' },
      { variant: 'solid', tone: 'success', className: 'bg-success-fg' },
      { variant: 'solid', tone: 'warning', className: 'bg-warning-fg' },
      { variant: 'solid', tone: 'danger',  className: 'bg-danger-fg' },
      { variant: 'solid', tone: 'neutral', className: 'bg-ink-strong' },
    ],
    defaultVariants: {
      size: 'sm',
      variant: 'soft',
      tone: 'neutral',
    },
  }
);

const dotVariants = cva('inline-block shrink-0 rounded-full', {
  variants: {
    size: {
      xs: 'size-1.5',
      sm: 'size-1.5',
      md: 'size-2',
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
});

export interface ChipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof chipVariants> {
  /** Leading icon (usually a lucide element). Ignored when `dot` is true. */
  icon?: ReactNode;
  /** Show a leading tone dot instead of an icon. */
  dot?: boolean;
  /** Animate the dot to signal a live/ongoing state. Requires `dot`. */
  pulse?: boolean;
  /** If provided, renders a close button on the right of the chip. */
  onRemove?: () => void;
  /** a11y label for the close button. Default: "Remove". */
  removeLabel?: string;
  children: ReactNode;
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { className, tone, variant, size, icon, dot, pulse, onRemove, removeLabel = 'Remove', children, ...rest },
  ref
) {
  return (
    <span ref={ref} className={cn(chipVariants({ tone, variant, size }), className)} {...rest}>
      {dot ? (
        <span
          className={cn(dotVariants({ tone, size }), pulse && 'motion-safe:animate-pulse')}
          aria-hidden="true"
        />
      ) : icon ? (
        <span className="inline-flex" aria-hidden="true">{icon}</span>
      ) : null}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={removeLabel}
          className={cn(
            'ml-0.5 inline-flex items-center justify-center rounded-full opacity-70',
            'transition-opacity hover:opacity-100',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current',
            size === 'xs' ? 'size-3' : 'size-3.5',
          )}
        >
          <X strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
});
