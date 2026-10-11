import React from 'react';
import type { LiveShift } from '../../lib/home/live.js';

interface Props {
  shift: LiveShift | null;
  loading: boolean;
}

/** The running Shift at a glance, or a plain "No open shift". */
export const LiveShiftStrip: React.FC<Props> = ({ shift, loading }) => {
  if (!shift) {
    return (
      <section
        aria-label="Live shift"
        className="mx-3 flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3"
      >
        <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-text-faint" />
        <div>
          <p className="text-sm font-bold text-text-high">
            {loading ? 'Checking shift…' : 'No open shift'}
          </p>
          {!loading && <p className="text-xs text-text-muted">Fuel sales count as Shifts close</p>}
        </div>
      </section>
    );
  }
  return (
    <section
      aria-label="Live shift"
      className="mx-3 flex items-center gap-3 rounded-2xl border border-hero-line bg-[image:var(--hero)] px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-text-high">{shift.name} live</p>
        <p className="truncate text-xs text-text-muted">{shift.detail}</p>
      </div>
      <div className="ml-auto flex-shrink-0 text-right">
        <p className="num text-lg font-semibold text-accent">{shift.elapsed}</p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">open</p>
      </div>
    </section>
  );
};
