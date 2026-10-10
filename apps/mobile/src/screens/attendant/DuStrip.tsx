import React, { useEffect, useState } from 'react';
import type { AssignedDu } from '../../components/handover/model.js';
import { formatOnShift, minutesOnShift } from '../../lib/handover/recap.js';

/** Re-renders on an interval so "time on shift" keeps counting. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "You're on DU2" · Shift name · nozzles · time on shift. */
export const DuStrip: React.FC<{
  dus: AssignedDu[];
  shiftName: string | null | undefined;
  openedAt: string | null | undefined;
}> = ({ dus, shiftName, openedAt }) => {
  const now = useNow(30_000);
  const minutes = minutesOnShift(openedAt, now);
  const nozzles = dus.flatMap((du) => du.nozzles.map((nz) => nz.nozzleName));
  const meta = [shiftName ?? 'Shift', nozzles.join(', ')].filter(Boolean).join(' · ');
  return (
    <section
      aria-label="Your dispenser unit"
      className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3"
    >
      <span aria-hidden className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-good" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-bold text-text-high">
          You&apos;re on {dus.map((du) => du.duName).join(', ')}
        </p>
        <p className="m-0 truncate text-[11px] text-text-muted">{meta}</p>
      </div>
      {minutes != null ? (
        <div className="flex-shrink-0 text-right">
          <p className="num m-0 text-sm font-semibold text-text-high">{formatOnShift(minutes)}</p>
          <p className="m-0 text-[10px] text-text-muted">on shift</p>
        </div>
      ) : null}
    </section>
  );
};
