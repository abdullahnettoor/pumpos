import React from 'react';

export interface SectionHeaderProps {
  /** Section title, rendered 12px semibold uppercase muted (FORECOURT, FUELS, MONEY). */
  title: string;
  /** 12px muted context line next to the title ("Shift 2 · 6 DUs"). */
  subtitle?: React.ReactNode;
  /** Right-aligned link ("Workspace ›"). Omit when the role has no destination. */
  action?: { label: string; onClick: () => void };
}

/**
 * The one in-page section heading (#523), promoted from the Dashboard's column
 * header: a 12px uppercase muted title, an optional context line and an
 * optional link on the right. On the Dashboard it heads each board column and
 * the cards below carry no header of their own (DashboardCard `card`/`plain`).
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, action }) => (
  <header
    className="flex items-baseline gap-2 px-0.5"
    data-testid={`section-header-${title.toLowerCase().replace(/\s+/g, '-')}`}
  >
    <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
    {subtitle != null && subtitle !== '' && (
      <span className="min-w-0 truncate text-[12px] text-ink-muted">{subtitle}</span>
    )}
    {action && (
      <button
        type="button"
        className="ml-auto shrink-0 text-[12px] font-medium text-brand hover:underline"
        onClick={action.onClick}
      >
        {action.label} ›
      </button>
    )}
  </header>
);
