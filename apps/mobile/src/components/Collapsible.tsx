import React, { useState } from 'react';

interface Props {
  title: string;
  /** One-line at-a-glance summary shown in the header (so collapsed still informs). */
  summary?: string;
  /** Optional count/severity badge. */
  badge?: { text: string; tone?: 'danger' | 'warning' | 'default' };
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const BADGE_TONE = {
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  default: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
} as const;

/** Accordion section — a header that shows a summary and expands to reveal detail. */
export const Collapsible: React.FC<Props> = ({ title, summary, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const tone = BADGE_TONE[badge?.tone ?? 'default'];
  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{title}</p>
          {summary && !open && (
            <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{summary}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: tone.bg, color: tone.fg }}
            >
              {badge.text}
            </span>
          )}
          <span
            className="text-sm"
            style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease-out' }}
          >
            ›
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          {children}
        </div>
      )}
    </section>
  );
};
