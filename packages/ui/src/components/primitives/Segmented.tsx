import React from 'react';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Grid columns; defaults to one column per option. */
  columns?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * Segmented control — a compact button group for a small, fixed set of mutually
 * exclusive options (payment method, filters, view toggles). Replaces the
 * hand-rolled inline-styled button grids. Controlled via `value` / `onChange`;
 * wire into React Hook Form with a `Controller`.
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  disabled,
  size = 'md',
  columns,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const cols = columns ?? options.length;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('segmented', size === 'sm' && 'segmented--sm', className)}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cx('segmented-item', active && 'segmented-item--active')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
