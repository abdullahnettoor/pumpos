import { useMemo } from 'react';
import { useDailyDssr, useDailyDssrPreview } from '@pump/ui';
import { businessDateSettings } from '@pump/shared';
import type { BusinessDayListStatus, Station } from '@pump/shared';
import { deriveTiles } from '../../lib/home/figures.js';
import { deriveSales, readSnapshot } from '../../lib/home/sales.js';
import { deriveOmcCard, deriveShiftRows, deriveTankMovement } from '../../lib/reports/dssr.js';

/** What the two DSSR reads return (the services are untyped): a stored snapshot row or a preview. */
interface DssrRow {
  generatedAt?: string;
  /** Set by the preview: the day is still open, so the figures are a draft. */
  live?: boolean;
  snapshotData?: unknown;
}

/** Where a day's DSSR comes from: Sealed → the snapshot; Draft or not in the list → the preview; Live / Report missing → none. */
const dssrSource = (status: BusinessDayListStatus | undefined): 'snapshot' | 'preview' | null =>
  status === 'SEALED' ? 'snapshot' : status === undefined || status === 'DRAFT' ? 'preview' : null;

/**
 * One Business Day's DSSR for the page. A Sealed day reads its immutable DSSR
 * snapshot; any other day with a report (Draft, or a date the list has not
 * loaded) reads the DSSR preview. A Live day has no DSSR, so neither is read.
 * Whether the figures are a draft comes from the payload (`live`), not from the
 * list, so a day closed since the list loaded never shows a Draft banner.
 * Every figure comes from the payload through pure derivers.
 */
export function useDssrDay(
  station: Station,
  date: string,
  status: BusinessDayListStatus | undefined,
) {
  const { timeZone } = businessDateSettings(station.settings);
  const source = dssrSource(status);
  const snapshotQ = useDailyDssr(station.id, date, { enabled: source === 'snapshot' });
  const previewQ = useDailyDssrPreview(station.id, date, { enabled: source === 'preview' });
  const q = source === 'snapshot' ? snapshotQ : previewQ;
  const row: DssrRow | null | undefined = source ? q.data : null;

  const model = useMemo(() => {
    if (!row) return null;
    const snap = readSnapshot(row);
    const shifts = deriveShiftRows(snap, timeZone);
    return {
      row,
      snap,
      draft: row.live === true,
      shifts,
      tiles: deriveTiles(snap),
      omcCard: deriveOmcCard(snap),
      sales: deriveSales(snap),
      tanks: deriveTankMovement(snap),
    };
  }, [row, timeZone]);

  return {
    model,
    loading: source !== null && q.isLoading,
    error: source !== null && q.isError && !row,
    refetch: () => void q.refetch(),
  };
}

export type DssrDay = NonNullable<ReturnType<typeof useDssrDay>['model']>;
