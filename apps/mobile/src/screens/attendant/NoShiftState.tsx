import React from 'react';

/** No open Shift has this attendant on a pump: explain, and let them re-check. */
export const NoShiftState: React.FC<{
  refreshing: boolean;
  failed: boolean;
  onRefresh: () => void;
}> = ({ refreshing, failed, onRefresh }) => (
  <div className="flex flex-col items-center px-8 pt-16 text-center">
    <span
      aria-hidden
      className="grid h-16 w-16 place-items-center rounded-[20px] border border-line bg-card text-text-muted"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17" />
        <path d="M3 22h12" />
        <path d="M7 8h4" />
        <path d="M15 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3" />
      </svg>
    </span>
    <h2 className="m-0 mt-3.5 text-lg font-extrabold text-text-high">
      {failed ? "Couldn't load your shift" : 'No shift assigned'}
    </h2>
    <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-text-muted">
      {failed
        ? 'Check your connection and try again.'
        : 'When your manager opens a shift and puts you on a pump, your handover appears here.'}
    </p>
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className="mt-5 h-11 rounded-xl border border-line-strong bg-card px-5 text-sm font-semibold text-text-high disabled:opacity-60"
    >
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  </div>
);
