import React, { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { STATUS_MAP, type PumpStatus } from '../chip/status-map.js';
import type { ChipTone } from '../chip/Chip.js';

export interface FilterChipOption<T extends string> {
  value: T;
  /** A string label is read with its count ("Overdue, 3"). */
  label: ReactNode;
  /** Rows this filter would show. Shown before the operator clicks. */
  count?: number;
  /**
   * The status the filter selects; the count takes its tone (Overdue amber,
   * Over limit red). A count of 0 stays neutral: no problem, no colour.
   */
  status?: PumpStatus;
}

export interface FilterChipsProps<T extends string> {
  options: readonly FilterChipOption<T>[];
  value: T;
  /** Applies at once; there is no Apply step. */
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

const COUNT_TONE: Record<ChipTone, string> = {
  brand: 'text-brand',
  info: 'text-info-fg',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  neutral: 'text-ink-muted',
};

/**
 * FilterChips (#567): single-select row filters with counts, `All 8 · Overdue
 * 3 · Over limit 1`. For quick status filters over a list; categories and
 * long lists use a select instead.
 *
 * A radiogroup: Tab reaches the selected chip, ←/→ (and Home / End) move and
 * select, wrapping around.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: FilterChipsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const at = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    const from = at < 0 ? 0 : at;
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? from >= last
          ? 0
          : from + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? from <= 0
            ? last
            : from - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (to < 0 || to === at) return;
    e.preventDefault();
    onChange(options[to].value);
    refs.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('inline-flex flex-wrap items-center gap-1.5', className)}
    >
      {options.map((opt, i) => {
        const checked = opt.value === value;
        const tone = opt.status && opt.count !== 0 ? STATUS_MAP[opt.status].tone : 'neutral';
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // Screen readers hear "Overdue, 3", not "Overdue3".
            aria-label={
              opt.count != null && typeof opt.label === 'string'
                ? `${opt.label}, ${opt.count}`
                : undefined
            }
            tabIndex={checked || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => !checked && onChange(opt.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-chip border px-2.5 text-[12px] font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              checked
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border-soft bg-surface text-ink-muted hover:text-ink-strong',
            )}
          >
            <span>{opt.label}</span>
            {opt.count != null && (
              <span
                data-tone={tone}
                className={cn(
                  'font-mono text-[12px] font-semibold',
                  checked && tone === 'neutral' ? 'text-brand' : COUNT_TONE[tone],
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
