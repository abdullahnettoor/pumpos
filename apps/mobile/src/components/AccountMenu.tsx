import React, { useState } from 'react';

interface Props {
  userName: string;
  role: string;
  stationName?: string;
  onSignOut: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Top-right account button → quiet menu holding identity + the (secondary) sign-out. */
export const AccountMenu: React.FC<Props> = ({ userName, role, stationName, onSignOut }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold"
        style={{ backgroundColor: 'var(--bg-surface-alt)', color: 'var(--text-strong)' }}
        aria-label="Account"
        aria-expanded={open}
      >
        {initialsOf(userName)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute right-0 z-40 mt-2 w-56 rounded-xl border p-1 shadow-lg"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{userName}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {role}
                {stationName ? ` · ${stationName}` : ''}
              </p>
            </div>
            <div className="border-t pt-1" style={{ borderColor: 'var(--border-soft)' }}>
              <button
                type="button"
                onClick={() => { setOpen(false); onSignOut(); }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium"
                style={{ color: 'var(--state-danger-fg)' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
