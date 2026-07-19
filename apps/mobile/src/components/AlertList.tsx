import React from 'react';
import type { MobileAlert, AlertSeverity } from '../lib/alerts.js';
import type { TabKey } from './BottomNav.js';

const SEV: Record<AlertSeverity, { bg: string; fg: string }> = {
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  info: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
};

interface Props {
  alerts: MobileAlert[];
  onNavigate?: (tab: TabKey) => void;
  limit?: number;
  /** When set, shows this text instead of nothing when there are no alerts. */
  emptyText?: string;
}

/** Severity-sorted "needs attention" list; each row deep-links to its tab. */
export const AlertList: React.FC<Props> = ({ alerts, onNavigate, limit, emptyText }) => {
  const rows = limit ? alerts.slice(0, limit) : alerts;

  if (rows.length === 0) {
    return emptyText ? (
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success-fg)' }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--state-success-fg)' }} />
        {emptyText}
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((a) => {
        const c = SEV[a.severity];
        const tappable = !!(a.tab && onNavigate);
        return (
          <button
            key={a.id}
            type="button"
            disabled={!tappable}
            onClick={() => a.tab && onNavigate?.(a.tab)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left"
            style={{ backgroundColor: c.bg, cursor: tappable ? 'pointer' : 'default' }}
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.fg }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium" style={{ color: c.fg }}>{a.title}</p>
              {a.meta && <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.meta}</p>}
            </div>
            {tappable && (
              <span className="flex-shrink-0 text-xs" style={{ color: c.fg }}>›</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
