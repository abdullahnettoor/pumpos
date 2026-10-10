import React from 'react';

/** Up to two initials: "Sajid P" -> "SP", "Highway Fuels" -> "HF". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The attendant's whole chrome: the Station mark and name, who they are, and
 * the avatar that opens the account sheet. There is nothing else to navigate
 * to, so there is deliberately no menu, bell or station switcher.
 */
export const AttendantHeader: React.FC<{
  stationName: string;
  userName: string;
  onOpenAccount: () => void;
}> = ({ stationName, userName, onOpenAccount }) => (
  <header className="mobile-safe-top flex flex-shrink-0 items-center gap-2.5 border-b border-line bg-card px-4 pb-2.5">
    <span
      aria-hidden
      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-accent text-xs font-extrabold text-on-accent"
    >
      {initialsOf(stationName)}
    </span>
    <div className="min-w-0 flex-1 leading-tight">
      <h1 className="m-0 truncate text-[15px] font-extrabold text-text-high">{stationName}</h1>
      <p className="m-0 truncate text-[11px] text-text-muted">{userName} · Attendant</p>
    </div>
    <button
      type="button"
      onClick={onOpenAccount}
      aria-label="Account"
      aria-haspopup="dialog"
      className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-full border border-line bg-card-alt text-xs font-bold text-text-high"
    >
      {initialsOf(userName)}
    </button>
  </header>
);
