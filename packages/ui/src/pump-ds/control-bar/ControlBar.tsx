import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface ControlBarSlots {
  /** `DateRangeMenu`: the period of what sits below the bar. */
  range?: ReactNode;
  /** `SearchInput`: free text over the rows below. */
  search?: ReactNode;
  /** Row filters: `FilterChips`, a select for 5+ options, `SegmentedControl` for 2–4 views. */
  filters?: ReactNode;
  /**
   * Buttons that act on what sits below the bar (Add entry on one account's
   * statement), before the export menu and info tip. Page-wide actions stay in
   * the Page Frame.
   */
  actions?: ReactNode;
  /** `ExportMenu`, at the right end. */
  exportMenu?: ReactNode;
  /** `InfoTip` explaining how the figures are worked out, last. */
  info?: ReactNode;
}

export interface ControlBarProps extends ControlBarSlots {
  className?: string;
}

const ORDER = ['range', 'search', 'filters'] as const;

/**
 * One control height in a bar (#603): every field is 32px, as the buttons,
 * date menu, segmented control and filter chips are; search is 240px wide.
 * Applied by the bar, so a page passing `inputSize="sm"` still lines up.
 */
export const CONTROL_BAR_FIT =
  '[&_input:not([type=checkbox]):not([type=radio])]:h-8 [&_select]:h-8 [&>[data-slot=search]>*]:w-[240px]';
const END = ['actions', 'exportMenu', 'info'] as const;

/**
 * ControlBar (#567): one row of page controls in a fixed order, range ·
 * search · filters · (space) · actions · export · info tip, so every page reads the
 * same. Every control in it is 32px high (#603). Pages pass slots, not a layout. The row wraps cleanly on narrow
 * screens (1366px with the sidebar open): the end group stays together.
 *
 * Layout A (reports) puts one bar under the tabs to drive everything below it;
 * layout B (ledgers, balance lists) puts it in the `SectionHeader` of the
 * table it filters (`controls`).
 */
export function ControlBar({ className, ...slots }: ControlBarProps) {
  const has = (k: keyof ControlBarSlots) => slots[k] != null && slots[k] !== false;
  const hasEnd = END.some(has);
  return (
    <div
      data-testid="control-bar"
      className={cn('flex min-w-0 flex-wrap items-center gap-2', CONTROL_BAR_FIT, className)}
    >
      {ORDER.filter(has).map((k) => (
        <div key={k} data-slot={k} className="flex min-w-0 flex-wrap items-center gap-2">
          {slots[k]}
        </div>
      ))}
      {hasEnd && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {END.filter(has).map((k) => (
            <div key={k} data-slot={k} className="flex items-center">
              {slots[k]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
