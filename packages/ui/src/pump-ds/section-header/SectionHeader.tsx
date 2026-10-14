import React from 'react';
import { cn } from '../lib/cn.js';
import { ControlBar, type ControlBarSlots } from '../control-bar/ControlBar.js';

export interface SectionHeaderProps {
  /** Section title, rendered 12px semibold uppercase muted (FORECOURT, FUELS, MONEY). */
  title: string;
  /** 12px muted context line next to the title ("Shift 2 · 6 DUs"). */
  subtitle?: React.ReactNode;
  /** Right-aligned link ("Workspace ›"). Omit when the role has no destination. */
  action?: { label: string; onClick: () => void };
  /**
   * The controls of the table this header heads (layout B, #567): rendered as
   * a `ControlBar` at the right, in its fixed order.
   */
  controls?: ControlBarSlots;
}

/**
 * The one in-page section heading (#523), promoted from the Dashboard's column
 * header: a 12px uppercase muted title, an optional context line and an
 * optional link on the right. On the Dashboard it heads each board column and
 * the cards below carry no header of their own (DashboardCard `card`/`plain`).
 *
 * With `controls` it is the header of a filtered table: the bar sits directly
 * above what it controls, and wraps under the title on narrow screens.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  action,
  controls,
}) => (
  <header
    className={
      controls
        ? 'flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1.5 px-0.5'
        : 'flex items-baseline gap-2 px-0.5'
    }
    data-testid={`section-header-${title.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
    {subtitle != null && subtitle !== '' && (
      <span className="min-w-0 truncate text-[12px] text-ink-muted">{subtitle}</span>
    )}
    {controls && <ControlBar {...controls} className="ml-auto justify-end" />}
    {action && (
      <button
        type="button"
        className={cn(
          !controls && 'ml-auto',
          'shrink-0 text-[12px] font-medium text-brand hover:underline',
        )}
        onClick={action.onClick}
      >
        {action.label} ›
      </button>
    )}
  </header>
);
