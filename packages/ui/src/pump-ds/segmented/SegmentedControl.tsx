import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Fill the row: segments share the width equally (a full-width mobile toggle). */
  stretch?: boolean;
  /** Fill the selected segment with the brand colour instead of raising it (default `raised`). */
  activeStyle?: 'raised' | 'brand';
  'aria-label': string;
  className?: string;
}

/**
 * A compact joined segmented control: one track, the selected segment raised
 * on it. For a short inline choice in a toolbar or settings row (paper size,
 * view mode). Each segment is padded to its label, so short and long labels
 * both read clearly.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  stretch,
  activeStyle = 'raised',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={
        stretch ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined
      }
      className={cn(
        stretch ? 'grid h-8 w-full items-stretch gap-0.5' : 'inline-flex h-8 items-center gap-0.5',
        'rounded-button border border-border-soft bg-surface-alt p-0.5',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            className={cn(
              'h-full rounded-[6px] px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed',
              active
                ? activeStyle === 'brand'
                  ? 'bg-brand text-[color:var(--on-accent,#fff)]' // --on-accent: themed text on brand (mobile)
                  : 'bg-surface text-ink-strong shadow-sm ring-1 ring-border-soft'
                : 'text-ink-muted hover:text-ink-strong',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
