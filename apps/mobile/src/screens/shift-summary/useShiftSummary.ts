import { useMemo } from 'react';
import {
  useDispensers,
  useMerchandiseHandovers,
  useMerchandiseSales,
  useNozzles,
  useShiftSummaries,
} from '@pump/ui';
import { businessDateSettings, shiftDisplayLabel } from '@pump/shared';
import type { Station } from '@pump/shared';
import { shiftLabel, type Snapshot } from '../../lib/home/sales.js';
import type { ShiftSummaryRow } from '../../lib/shifts/history.js';
import {
  deriveShiftProducts,
  deriveShiftSummary,
  nozzleDuNames,
} from '../../lib/shifts/summary.js';
import { windowLabel } from '../../lib/shifts/window.js';

/**
 * One Shift Summary: the immutable snapshot (read from the summaries cache,
 * falling back to the row the page was opened from) and, because a snapshot
 * holds only fuel, the Shift's Product Sales from the merchandise endpoints.
 * The derivations are pure and live in `lib/shifts/summary.ts`.
 */
export function useShiftSummary(
  station: Station,
  shiftId: string,
  initial: ShiftSummaryRow | undefined,
) {
  const { timeZone } = businessDateSettings(station.settings);
  const summariesQ = useShiftSummaries(station.id);
  const nozzlesQ = useNozzles(station.id);
  const dispensersQ = useDispensers(station.id);
  const handoversQ = useMerchandiseHandovers(shiftId);
  const billedQ = useMerchandiseSales(shiftId);

  // A late-attributed record refreshes the stored snapshot, so the cache wins over the opening row.
  const row =
    (summariesQ.data as ShiftSummaryRow[] | undefined)?.find((s) => s.shiftId === shiftId) ??
    initial;
  const handovers = handoversQ.data;
  const billed = billedQ.data;
  const nozzles = nozzlesQ.data;
  const dispensers = dispensersQ.data;

  const model = useMemo(() => {
    if (!row) return null;
    const snap = (row.snapshotData ?? {}) as Snapshot;
    return {
      row,
      title: shiftLabel(row),
      /** The readable name the PDF uses (`20261009-1`). */
      code: shiftDisplayLabel(row),
      window: windowLabel(row.openedAt, row.closedAt, timeZone),
      figures: deriveShiftSummary(snap, nozzleDuNames(nozzles ?? [], dispensers ?? [])),
    };
  }, [row, nozzles, dispensers, timeZone]);

  const products = useMemo(
    () =>
      handovers && billed
        ? deriveShiftProducts(handovers as Snapshot[], billed as Snapshot[])
        : null,
    [handovers, billed],
  );

  return {
    model,
    products,
    /** Fuel is complete; product sales arrive with their own reads. */
    productsLoading: handoversQ.isLoading || billedQ.isLoading,
    productsError: handoversQ.isError || billedQ.isError,
    summariesLoading: summariesQ.isLoading,
  };
}
