import { useMemo } from 'react';
import { useDispensers, useNozzles, useShiftSummaryById } from '@pump/ui';
import { businessDateSettings, shiftDisplayLabel } from '@pump/shared';
import type { Station } from '@pump/shared';
import { shiftLabel, type Snapshot } from '../../lib/home/sales.js';
import type { ShiftSummaryRow } from '../../lib/shifts/history.js';
import { deriveShiftSummary, nozzleDuNames } from '../../lib/shifts/summary.js';
import { windowLabel } from '../../lib/shifts/window.js';

/**
 * One Shift Summary: the immutable snapshot, read by shift id (so the page
 * opens for a Shift of any age, from any entry point) and painted at once from
 * the row it was opened from. Every figure comes from the snapshot; the
 * derivations are pure and live in `lib/shifts/summary.ts`.
 *
 * The station's nozzle and dispenser lists are read only for a snapshot whose
 * readings predate their stored Dispenser Unit.
 */
export function useShiftSummary(
  station: Station,
  shiftId: string,
  initial: ShiftSummaryRow | undefined,
) {
  const { timeZone } = businessDateSettings(station.settings);
  const summaryQ = useShiftSummaryById(shiftId, { placeholderData: initial });
  // A late-attributed record refreshes the stored snapshot, so the read wins over the opening row.
  const row = (summaryQ.data as ShiftSummaryRow | undefined) ?? initial;

  const readings = (row?.snapshotData as Snapshot | undefined)?.nozzleReadings;
  const needsSetup = Array.isArray(readings) && readings.some((r: Snapshot) => r.duName == null);
  const nozzlesQ = useNozzles(station.id, { enabled: needsSetup });
  const dispensersQ = useDispensers(station.id, { enabled: needsSetup });
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

  return { model, loading: summaryQ.isLoading };
}
