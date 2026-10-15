import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';
import { useAnchoredPopover } from '../lib/anchoredPopover.js';
import { Icon } from '../icon/Icon.js';
import {
  formatPickerDate,
  monthCaption,
  monthOf,
  monthWeeks,
  shiftDate,
  shiftMonth,
} from './calendar.js';

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
  /**
   * `control` (default): a 32px bar control sized to its date. `field`: a
   * 36px form field filling its column, as the other inputs in a form (#609).
   */
  variant?: 'control' | 'field';
  /** The calendar cannot be opened. */
  disabled?: boolean;
  /** Marks the field as failing validation (red border, `aria-invalid`). */
  invalid?: boolean;
  /** The button's id, so a `<label htmlFor>` or a hint can point at it. */
  id?: string;
  /** Hint or error text describing the field. */
  'aria-describedby'?: string;
  /**
   * The portalled calendar, so a control hosting the picker in its own popover
   * (`DateRangeMenu`) can treat presses and focus there as inside (#609).
   */
  calendarRef?: React.MutableRefObject<HTMLDivElement | null>;
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
export const DatePickerButton = forwardRef<HTMLButtonElement, DatePickerButtonProps>(
  function DatePickerButton(
    {
      value,
      onChange,
      max,
      min,
      'aria-label': ariaLabel,
      align = 'start',
      variant = 'control',
      disabled = false,
      invalid = false,
      id,
      'aria-describedby': describedBy,
      calendarRef,
      className,
    },
    ref,
  ) {
    const [openState, setOpen] = useState(false);
    // Disabled while open (a form starts saving): the calendar closes.
    const open = openState && !disabled;
    // No day chosen yet: the calendar opens on the latest day allowed (the
    // station's today, from the caller), else this device's calendar month.
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const home = valid ? value : (max ?? deviceToday());
    const [focusDay, setFocusDay] = useState(home);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);
    const setPopover = useCallback(
      (el: HTMLDivElement | null) => {
        popoverRef.current = el;
        if (calendarRef) calendarRef.current = el;
      },
      [calendarRef],
    );
    const gridId = useId();
    const month = monthOf(focusDay);

    const allowed = (d: string) => (!max || d <= max) && (!min || d >= min);
    const clamp = (d: string) => (max && d > max ? max : min && d < min ? min : d);

    // Fixed under the button (above when there is no room below); a click
    // outside closes it without moving focus. Shared with DateRangeMenu.
    const position = useAnchoredPopover({
      open,
      triggerRef,
      popoverRef,
      align,
      onPressOutside: () => setOpen(false),
    });

    // The focused day follows the arrows.
    useEffect(() => {
      if (!open) return;
      popoverRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)
        ?.focus({ preventScroll: true });
    }, [open, focusDay]);

    const openCalendar = () => {
      if (disabled) return;
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

    // The popover is portalled to the end of <body>, so Tab is kept to it, as in
    // DateRangeMenu: Tab past the last stop (the day) or Shift+Tab before the
    // first closes the calendar and returns focus to the button.
    const onPopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const stops = Array.from(
        popoverRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
      ).filter((b) => b.tabIndex >= 0);
      const at = stops.indexOf(e.target as HTMLButtonElement);
      if ((e.shiftKey && at <= 0) || (!e.shiftKey && at === stops.length - 1)) {
        e.preventDefault();
        close();
      }
    };

    // Focus leaving for somewhere else (a click into another control, a
    // programmatic move) closes it without pulling focus back.
    const onPopoverBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && !popoverRef.current?.contains(next) && !triggerRef.current?.contains(next)) {
        setOpen(false);
      }
    };

    const goMonth = (n: number) => {
      const target = shiftMonth(month, n);
      setFocusDay(clamp(`${target}-01`));
    };
    const nextBlocked = !!max && shiftMonth(month, 1) > monthOf(max);
    const prevBlocked = !!min && shiftMonth(month, -1) < monthOf(min);

    const field = variant === 'field';
    return (
      <div className={cn('relative', field ? 'flex w-full' : 'inline-flex', className)}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-label={`${ariaLabel}: ${valid ? formatPickerDate(value) : 'not chosen'}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
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
            'inline-flex items-center gap-2 whitespace-nowrap border bg-surface text-ink-strong',
            'transition-colors hover:bg-surface-alt',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-muted disabled:hover:bg-surface-alt',
            field
              ? 'h-9 w-full rounded-[var(--radius-input)] px-3 text-left text-[13px]'
              : 'h-8 rounded-button px-2.5 text-[12px] font-semibold',
            invalid ? 'border-danger-fg' : open ? 'border-brand' : 'border-border-strong',
          )}
        >
          <Icon name="calendar" size="xs" className="text-ink-muted" aria-hidden="true" />
          <span className={cn(field && 'flex-1', !valid && 'font-normal text-ink-faint')}>
            {valid ? formatPickerDate(value) : 'Choose a date'}
          </span>
          <Icon name="chevron-down" size="xs" className="text-ink-muted" aria-hidden="true" />
        </button>

        {open &&
          createPortal(
            <div
              ref={setPopover}
              role="dialog"
              aria-label={ariaLabel}
              style={position}
              onKeyDown={onPopoverKeyDown}
              onBlur={onPopoverBlur}
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
              <div
                id={gridId}
                role="grid"
                aria-label={monthCaption(month)}
                onKeyDown={onGridKeyDown}
              >
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
  },
);
