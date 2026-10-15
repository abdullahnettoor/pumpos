import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';
import { Icon } from '../icon/Icon.js';
import {
  formatPickerDate,
  monthCaption,
  monthOf,
  monthWeeks,
  shiftDate,
  shiftMonth,
} from './calendar.js';

const GAP = 6;

/** This device's calendar date; only a page to open the calendar on, never data. */
function deviceToday(): string {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
    .join('-');
}
const WEEK_HEAD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

export interface DatePickerButtonProps {
  /** The chosen day, `YYYY-MM-DD`. */
  value: string;
  /** Called with a day picked from the calendar. */
  onChange: (date: string) => void;
  /** The latest day that can be picked (the station's today). */
  max?: string;
  /** The earliest day that can be picked. */
  min?: string;
  /** Accessible name ("DSR date"); the button reads it with the date. */
  'aria-label': string;
  /** Which edge of the button the calendar lines up with. Default `start`. */
  align?: 'start' | 'end';
  className?: string;
}

/**
 * DatePickerButton (#603): one day, as a button reading `Sun 11 Oct 2026` that
 * opens a month calendar, styled as `DateRangeMenu`. Replaces the native date
 * input, whose "11/10/2026" reads either way round.
 *
 * Keyboard: Enter, Space or ↓ opens on the chosen day; arrows move by a day
 * or a week, PageUp / PageDown by a month; Enter picks; Escape closes and
 * returns focus to the button. The calendar is portalled with fixed
 * positioning, above drawers (z 1050, as `DateRangeMenu`), and flips above
 * the button when there is no room below.
 */
export function DatePickerButton({
  value,
  onChange,
  max,
  min,
  'aria-label': ariaLabel,
  align = 'start',
  className,
}: DatePickerButtonProps) {
  const [open, setOpen] = useState(false);
  // No day chosen yet: the calendar opens on the latest day allowed (the
  // station's today, from the caller), else this device's calendar month.
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const home = valid ? value : (max ?? deviceToday());
  const [focusDay, setFocusDay] = useState(home);
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const month = monthOf(focusDay);

  const allowed = (d: string) => (!max || d <= max) && (!min || d >= min);
  const clamp = (d: string) => (max && d > max ? max : min && d < min ? min : d);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const height = popoverRef.current?.getBoundingClientRect().height ?? 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - r.bottom - GAP;
    const flip = height > below && r.top - GAP > below;
    setPosition({
      position: 'fixed',
      ...(flip ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
      ...(align === 'end' ? { right: vw - r.right } : { left: r.left }),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // A click outside closes it without moving focus.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (triggerRef.current?.contains(n) || popoverRef.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // The focused day follows the arrows.
  useEffect(() => {
    if (!open) return;
    popoverRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)
      ?.focus({ preventScroll: true });
  }, [open, focusDay]);

  const openCalendar = () => {
    setFocusDay(home);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (d: string) => {
    if (!allowed(d)) return;
    if (d !== value) onChange(d);
    close();
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      setFocusDay(clamp(shiftDate(focusDay, step[e.key])));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const target = shiftMonth(month, e.key === 'PageUp' ? -1 : 1);
      const days = monthWeeks(target).flat().filter(Boolean).length;
      const day = Math.min(Number(focusDay.slice(8)), days);
      setFocusDay(clamp(`${target}-${String(day).padStart(2, '0')}`));
    }
  };

  const onPopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const goMonth = (n: number) => {
    const target = shiftMonth(month, n);
    setFocusDay(clamp(`${target}-01`));
  };
  const nextBlocked = !!max && shiftMonth(month, 1) > monthOf(max);
  const prevBlocked = !!min && shiftMonth(month, -1) < monthOf(min);

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${ariaLabel}: ${valid ? formatPickerDate(value) : 'not chosen'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? gridId : undefined}
        data-value={value}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openCalendar();
          }
        }}
        className={cn(
          'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-button border border-border-strong bg-surface px-2.5 text-[12px] font-semibold text-ink-strong',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          open && 'border-brand',
        )}
      >
        <Icon name="calendar" size="xs" className="text-ink-muted" aria-hidden="true" />
        <span className={valid ? undefined : 'font-normal text-ink-faint'}>
          {valid ? formatPickerDate(value) : 'Choose a date'}
        </span>
        <Icon name="chevron-down" size="xs" className="text-ink-muted" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel}
            style={position}
            onKeyDown={onPopoverKeyDown}
            data-testid="date-picker-popover"
            className="z-[1050] w-[264px] rounded-card border border-border-soft bg-surface p-2 shadow-(--shadow-popover)"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={prevBlocked}
                onClick={() => goMonth(-1)}
                className="inline-flex size-7 items-center justify-center rounded-button text-ink-muted hover:bg-surface-alt hover:text-ink-strong disabled:opacity-40"
              >
                <Icon name="chevron-left" size="sm" />
              </button>
              <span className="text-[13px] font-semibold text-ink-strong" aria-live="polite">
                {monthCaption(month)}
              </span>
              <button
                type="button"
                aria-label="Next month"
                disabled={nextBlocked}
                onClick={() => goMonth(1)}
                className="inline-flex size-7 items-center justify-center rounded-button text-ink-muted hover:bg-surface-alt hover:text-ink-strong disabled:opacity-40"
              >
                <Icon name="chevron-right" size="sm" />
              </button>
            </div>
            <div id={gridId} role="grid" aria-label={monthCaption(month)} onKeyDown={onGridKeyDown}>
              <div role="row" className="grid grid-cols-7">
                {WEEK_HEAD.map((d) => (
                  <span
                    key={d}
                    role="columnheader"
                    className="py-1 text-center text-[12px] font-medium text-ink-faint"
                  >
                    {d}
                  </span>
                ))}
              </div>
              {monthWeeks(month).map((week, w) => (
                <div key={w} role="row" className="grid grid-cols-7">
                  {week.map((d, i) =>
                    d == null ? (
                      <span key={i} role="gridcell" />
                    ) : (
                      <span key={d} role="gridcell" aria-selected={d === value}>
                        <button
                          type="button"
                          data-date={d}
                          tabIndex={d === focusDay ? 0 : -1}
                          disabled={!allowed(d)}
                          aria-label={formatPickerDate(d)}
                          onClick={() => pick(d)}
                          className={cn(
                            'h-8 w-full rounded-md font-mono text-[12px] tabular-nums outline-none transition-colors',
                            'focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:text-ink-faint',
                            d === value
                              ? 'bg-brand font-semibold text-on-brand'
                              : 'text-ink-default hover:bg-surface-alt',
                            d === max && d !== value && 'font-semibold text-brand',
                          )}
                        >
                          {Number(d.slice(8))}
                        </button>
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
