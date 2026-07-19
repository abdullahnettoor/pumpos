import React from 'react';
import { HandoverPanel } from '../components/HandoverPanel.js';

/**
 * Attendant shell (mobile-only): a header + the shared handover panel. Other
 * roles reach the same panel via the "My handover" tab when assigned to a DU.
 */
export const AttendantScreen: React.FC<{ userName: string; onSignOut: () => void }> = ({ userName, onSignOut }) => {
  return (
    <div className="flex h-[100dvh] flex-col" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <header
        className="mobile-safe-top sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            P
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              My handover
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {userName} · Attendant
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <HandoverPanel />
      </main>
    </div>
  );
};
