import { useEffect, useState } from 'react';
import { formatShiftLabel } from '@pump/shared';
import { useShiftStatus } from '../query/hooks.js';
import { formatElapsedSince } from '../utils/format.js';

/**
 * The status-bar's open-shift indicator, e.g. `Shift 20260922-2 open · 6h 12m`.
 * Returns `undefined` when no shift is open, so the caller can simply omit the
 * segment (status 11 of #263 stays true).
 *
 * Data rides the existing operational-tier `useShiftStatus(stationId, lite)`
 * query — its lite payload already projects `businessDate`, `shiftSequence`,
 * and `openedAt`, and shift open/close writes already invalidate it, so opening
 * or closing a shift updates the segment with no manual refetch. The elapsed
 * time advances from a purely client-side ticker (~once a minute); it never
 * polls the API beyond the operational tier's normal behaviour.
 *
 * The label uses the shared `formatShiftLabel`, so it reads identically to the
 * same shift's name everywhere else (#228).
 */
export function useOpenShiftLabel(stationId: string | null | undefined): string | undefined {
  const { data } = useShiftStatus(stationId, true);
  const activeShift = (data as any)?.activeShift ?? null;
  const businessDate: string | null = activeShift?.businessDate ?? null;
  const shiftSequence: number | null = activeShift?.shiftSequence ?? null;
  const openedAt: string | null = activeShift?.openedAt ?? null;

  // Re-render about once a minute so the elapsed time stays current without
  // touching the network. Only ticks while a shift is open. The tick value is
  // unused — it exists purely to re-run the render, where formatElapsedSince
  // reads the wall clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!openedAt) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [openedAt]);

  const label = formatShiftLabel(businessDate, shiftSequence);
  if (!label || !openedAt) return undefined;

  return `Shift ${label} open \u00b7 ${formatElapsedSince(openedAt)}`;
}
