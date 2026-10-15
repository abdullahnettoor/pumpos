import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn.js';
import { Icon } from '../icon/Icon.js';
import { Input } from '../input/Input.js';
import { formatDateSpan } from '../../utils/format.js';
import { isInsideAny, useAnchoredPopover } from '../lib/anchoredPopover.js';
import {
  PRESET_LABEL,
  computeRange,
  matchPreset,
  type DateRange,
  type RangeClock,
  type RangePreset,
} from './range.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The earliest custom date: a partly typed year (`0020`) is not a date. */
const MIN_DATE = '2000-01-01';

export const DEFAULT_MENU_PRESETS: readonly RangePreset[] = [
  'today',
  'yesterday',
  'last-7',
  'this-week',
  'this-month',
  'last-month',
  'last-30',
  'this-year',
];

export interface DateRangeMenuProps {
  value: DateRange;
  /** Called on every choice: a preset, or a valid custom From/To. No Apply step. */
  onChange: (range: DateRange) => void;
  /** Station clock, so presets resolve to the business date. */
  clock?: RangeClock;
  /** Presets to offer, in order. Custom dates are always offered. */
  presets?: readonly RangePreset[];
  /** Accessible name of the trigger. Default "Date range". */
  'aria-label'?: string;
  /**
   * Which edge of the button the popover lines up with. Unset, it lines up
   * with the end when the button sits in the right half of the window, so a
   * menu at a header's right edge opens inward.
   */
  align?: 'start' | 'end';
  className?: string;
  /** Fixes "now" for tests and the showcase. */
  now?: Date;
}

/**
 * DateRangeMenu (#567): one button, `[calendar] This month · 1–14 Oct ▾`. Its
 * popover lists the presets with their dates, plus custom From/To fields. A
 * choice applies at once; Escape or a click outside closes it and focus goes
 * back to the button.
 *
 * Keyboard: Enter, Space or ↓ opens on the selected preset; ↑/↓, Home and End
 * move between presets; Enter or Space picks one; Tab reaches the custom dates.
 *
 * The popover is portalled to `document.body` with fixed positioning, so a
 * Panel or KpiStrip's `overflow-hidden` never clips it. It opens below the
 * button, or above when there is no room below.
 *
 * Custom dates apply only when complete and plausible (year 2000 or later, not
 * after the station's today), so a year being typed (`0002`, `0020`…) never
 * reaches `onChange`. A backwards range is put the right way round only when
 * focus leaves the From/To pair, on Enter, or when the popover closes, so
 * tabbing from From to To never commits a half-built range. Escape discards
 * the typed dates. The popover sits at z-index 1050 (as Combobox), above
 * drawers.
 */
export function DateRangeMenu({
  value,
  onChange,
  clock,
  presets = DEFAULT_MENU_PRESETS,
  'aria-label': ariaLabel = 'Date range',
  align,
  className,
  now,
}: DateRangeMenuProps) {
  const [open, setOpen] = useState(false);
  // The last preset picked, so two presets with the same dates (Today and This
  // month on the 1st) still show the one the operator chose.
  const [picked, setPicked] = useState<RangePreset | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const today = computeRange('today', clock, now).to;
  const rangeOf = (p: RangePreset) => computeRange(p, clock, now);
  const pickedStillMatches =
    picked != null &&
    picked !== 'custom' &&
    rangeOf(picked).from === value.from &&
    rangeOf(picked).to === value.to;
  const active: RangePreset = pickedStillMatches ? picked : matchPreset(value, presets, clock, now);
  const span = (r: DateRange) => formatDateSpan(r.from, r.to, { referenceDate: today });

  const inside = (node: Node | null) => isInsideAny(node, [rootRef, popoverRef]);

  // What the custom fields show. A field may hold a date still being typed;
  // only a complete, plausible date reaches `onChange`. Mirrored in a ref so a
  // commit fired from a blur during the same event (Escape, Tab out) or from
  // the document listener sees the latest draft.
  const [draft, setDraftState] = useState<DateRange>(value);
  const draftRef = useRef<DateRange>(value);
  const setDraft = (d: DateRange) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const valueRef = useRef(value);
  // The last range sent, so a commit from both a blur and a close sends once.
  const sentRef = useRef(value);
  // A new value from outside (a preset, the parent) replaces the draft.
  const [shown, setShown] = useState<DateRange>(value);
  if (shown.from !== value.from || shown.to !== value.to) {
    setShown(value);
    setDraftState(value);
  }
  // Keyed on the dates, not the object, so a parent re-render passing an equal
  // range never wipes a draft being typed.
  const { from: valueFrom, to: valueTo } = value;
  useLayoutEffect(() => {
    const v = { from: valueFrom, to: valueTo };
    valueRef.current = v;
    draftRef.current = v;
  }, [valueFrom, valueTo]);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  const plausible = (d: string) => ISO_DATE.test(d) && d >= MIN_DATE && d <= today;
  const same = (a: DateRange, b: DateRange) => a.from === b.from && a.to === b.to;

  const apply = (next: DateRange) => {
    if (same(next, valueRef.current) || same(next, sentRef.current)) return;
    sentRef.current = next;
    setPicked('custom');
    onChange(next);
  };

  const typeCustom = (patch: Partial<DateRange>) => {
    const next = { ...draftRef.current, ...patch };
    setDraft(next);
    // Applied at once only when both ends are plausible and in order.
    if (plausible(next.from) && plausible(next.to) && next.from <= next.to) apply(next);
  };

  // When focus leaves the From/To pair, on Enter, or when the popover closes:
  // put a backwards range the right way round, and drop anything implausible
  // back to the applied value.
  const commitCustom = () => {
    const d = draftRef.current;
    if (!plausible(d.from) || !plausible(d.to)) {
      setDraft(valueRef.current);
      return;
    }
    const next = d.from <= d.to ? d : { from: d.to, to: d.from };
    setDraft(next);
    apply(next);
  };
  const commitRef = useRef(commitCustom);
  useLayoutEffect(() => {
    commitRef.current = commitCustom;
  });

  // Escape throws the typed dates away.
  const discardCustom = () => setDraft(valueRef.current);

  // Closing commits the custom draft (Escape discards it first; a preset
  // replaces it).
  const close = (returnFocus: boolean) => {
    commitCustom();
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // Fixed under the button (above it when there is no room below), lined up
  // with its start or end edge; a click outside commits the custom dates and
  // closes without moving focus. Shared with DatePickerButton.
  const position = useAnchoredPopover({
    open,
    triggerRef,
    popoverRef,
    insideRefs: [rootRef],
    align,
    onPressOutside: () => {
      commitRef.current();
      setOpen(false);
    },
  });

  // Opening puts focus on the selected preset (the first, when custom). Only
  // on open: a later value change must not pull focus out of the date fields.
  const focusOnOpen = useRef(false);
  const activeIndex = Math.max(0, presets.indexOf(active));
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);
  const openMenu = () => {
    // Each opening starts from the applied range.
    setDraft(value);
    sentRef.current = value;
    focusOnOpen.current = true;
    setOpen(true);
  };

  const choose = (p: RangePreset) => {
    const range = rangeOf(p);
    setPicked(p);
    setDraft(range);
    sentRef.current = range;
    onChange(range);
    close(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = presets.length - 1;
    const at = itemRefs.current.findIndex((b) => b === document.activeElement);
    const to =
      e.key === 'ArrowDown'
        ? at >= last
          ? 0
          : at + 1
        : e.key === 'ArrowUp'
          ? at <= 0
            ? last
            : at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    itemRefs.current[to]?.focus();
  };

  // The portalled popover sits at the end of <body>, so Tab is kept inside
  // it: Shift+Tab from From goes back to the presets, and leaving either end
  // closes the popover and returns focus to the button.
  const onPopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      discardCustom();
      close(true);
      return;
    }
    if (e.key !== 'Tab') return;
    const target = e.target as HTMLElement;
    const inMenu = itemRefs.current.includes(target as HTMLButtonElement);
    if (e.shiftKey && target === fromRef.current) {
      e.preventDefault();
      itemRefs.current[activeIndex]?.focus();
    } else if ((e.shiftKey && inMenu) || (!e.shiftKey && target === toRef.current)) {
      e.preventDefault();
      close(true);
    }
  };

  const onPopoverBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !inside(next)) {
      commitCustom();
      setOpen(false);
    }
  };

  const onFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCustom();
    }
  };

  // Moving between From and To keeps building the range; leaving the pair
  // (or closing the popover) commits it.
  const onFieldBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget;
    if (next != null && (next === fromRef.current || next === toRef.current)) return;
    commitCustom();
  };

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${ariaLabel}: ${PRESET_LABEL[active]}, ${span(value)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-button border border-border-strong bg-surface px-2.5 text-[12px]',
          'transition-colors hover:bg-surface-alt',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          open && 'border-brand',
        )}
      >
        <Icon name="calendar" size="xs" className="text-ink-muted" aria-hidden="true" />
        <span className="font-semibold text-ink-strong">{PRESET_LABEL[active]}</span>
        <span className="text-ink-muted">{span(value)}</span>
        <Icon name="chevron-down" size="xs" className="text-ink-muted" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={position}
            className={cn(
              'z-[1050] w-[320px] rounded-card border border-border-soft bg-surface p-1.5',
              'shadow-(--shadow-popover)',
            )}
            onKeyDown={onPopoverKeyDown}
            onBlur={onPopoverBlur}
            data-testid="date-range-popover"
          >
            <div id={menuId} role="menu" aria-label={ariaLabel} onKeyDown={onMenuKeyDown}>
              {presets.map((p, i) => {
                const checked = p === active;
                return (
                  <button
                    key={p}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    tabIndex={-1}
                    onClick={() => choose(p)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] outline-none',
                      'hover:bg-surface-alt focus-visible:bg-surface-alt',
                      checked ? 'font-semibold text-brand' : 'text-ink-default',
                    )}
                  >
                    <span>{PRESET_LABEL[p]}</span>
                    <span className="text-[12px] font-normal text-ink-muted">
                      {span(rangeOf(p))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              role="group"
              aria-label="Custom range"
              className="mt-1 flex items-end gap-2 border-t border-border-soft px-1 pb-1 pt-2.5"
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-muted">
                From
                <Input
                  type="date"
                  inputSize="sm"
                  className="min-w-0 px-2"
                  ref={fromRef}
                  value={draft.from}
                  onChange={(e) => typeCustom({ from: e.target.value })}
                  onBlur={onFieldBlur}
                  onKeyDown={onFieldKeyDown}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-semibold text-ink-muted">
                To
                <Input
                  type="date"
                  inputSize="sm"
                  className="min-w-0 px-2"
                  ref={toRef}
                  value={draft.to}
                  onChange={(e) => typeCustom({ to: e.target.value })}
                  onBlur={onFieldBlur}
                  onKeyDown={onFieldKeyDown}
                />
              </label>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
