import { useEffect, useState } from 'react';
import { formatShiftLabel } from '@pump/shared';
import { useShiftStatus } from '../query/hooks.js';

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
  // touching the network. Only ticks while a shift is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!openedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [openedAt]);

  const label = formatShiftLabel(businessDate, shiftSequence);
  if (!label || !openedAt) return undefined;

  const elapsed = formatElapsed(now - new Date(openedAt).getTime());
  return `Shift ${label} open${elapsed ? ` \u00b7 ${elapsed}` : ''}`;
}

/** `4_320_000ms` → `1h 12m`. Sub-minute rounds to `0m`; negative clamps to empty. */
function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
