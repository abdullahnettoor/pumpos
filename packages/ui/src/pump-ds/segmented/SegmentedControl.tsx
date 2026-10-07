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
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-button border border-border-soft bg-surface-alt p-0.5',
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
                ? 'bg-surface text-ink-strong shadow-sm ring-1 ring-border-soft'
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
