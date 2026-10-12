import React from 'react';

export interface ColumnHeaderProps {
  /** Section title, rendered 12px semibold uppercase muted (FORECOURT, FUELS, MONEY). */
  title: string;
  /** 12px muted context line next to the title ("Shift 2 · 6 DUs"). */
  subtitle?: React.ReactNode;
  /** Right-aligned link ("Workspace ›"). Omit when the role has no destination. */
  action?: { label: string; onClick: () => void };
}

/**
 * The section head above a board column, rendered once per column; the cards
 * below it have no header of their own (DashboardCard `card`/`plain`).
 */
export const ColumnHeader: React.FC<ColumnHeaderProps> = ({ title, subtitle, action }) => (
  <header
    className="flex items-baseline gap-2 px-0.5"
    data-testid={`column-header-${title.toLowerCase().replace(/\s+/g, '-')}`}
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
