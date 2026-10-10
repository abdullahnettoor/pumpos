import { useRef, type KeyboardEvent, type ReactNode } from 'react';
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
  /** `vertical` stacks the segments as full-width rows (a short list of choices, e.g. date presets). */
  orientation?: 'horizontal' | 'vertical';
  /**
   * `automatic` (default): the arrow keys move AND select. `manual`: they only
   * move the focus; Enter / Space (or a click) chooses. Use `manual` when a
   * choice is costly (it saves, or reloads data) so a keyboard user can browse
   * the segments without committing each one.
   */
  activation?: 'automatic' | 'manual';
  'aria-label': string;
  className?: string;
}

/**
 * A compact joined segmented control: one track, the selected segment raised
 * on it. For a short inline choice in a toolbar or settings row (paper size,
 * view mode). Each segment is padded to its label, so short and long labels
 * both read clearly.
 *
 * A radiogroup with the standard keyboard model: Tab reaches the selected
 * segment only, the arrow keys (and Home / End) move to the neighbouring
 * segment and select it, wrapping around.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  stretch,
  activeStyle = 'raised',
  orientation = 'horizontal',
  activation = 'automatic',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const vertical = orientation === 'vertical';
  const at = options.findIndex((o) => o.value === value);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const last = options.length - 1;
    // Automatic activation walks from the selection; manual walks from the focus.
    const focused = buttons.current.findIndex((b) => b && b === document.activeElement);
    const from = activation === 'manual' && focused >= 0 ? focused : at;
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (from + 1) % options.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? from < 0
            ? last
            : (from - 1 + options.length) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (to < 0 || to === from) return;
    event.preventDefault();
    if (activation === 'automatic') onChange(options[to].value);
    buttons.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation={vertical ? 'vertical' : undefined}
      onKeyDown={onKeyDown}
      style={
        stretch && !vertical
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
          : undefined
      }
      className={cn(
        vertical
          ? 'flex w-full flex-col gap-0.5'
          : stretch
            ? 'grid h-8 w-full items-stretch gap-0.5'
            : 'inline-flex h-8 items-center gap-0.5',
        'rounded-button border border-border-soft bg-surface-alt p-0.5',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // Tab reaches the selected segment (the first, when nothing is selected).
            tabIndex={active || (at < 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            className={cn(
              'rounded-[6px] px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed',
              vertical ? 'min-h-11 w-full text-left' : 'h-full',
              active
                ? activeStyle === 'brand'
                  ? 'bg-brand text-on-brand'
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
