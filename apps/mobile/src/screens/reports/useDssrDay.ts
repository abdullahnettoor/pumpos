import { useMemo } from 'react';
import { useDailyDssr, useDailyDssrPreview } from '@pump/ui';
import { businessDateSettings } from '@pump/shared';
import type { BusinessDayListStatus, Station } from '@pump/shared';
import { deriveTiles } from '../../lib/home/figures.js';
import { deriveSales, readSnapshot } from '../../lib/home/sales.js';
import { deriveShiftRows, deriveTankMovement } from '../../lib/reports/dssr.js';

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
  const sealed = status === 'SEALED';
  const readsPreview = status === undefined || status === 'DRAFT';
  const snapshotQ = useDailyDssr(station.id, date, { enabled: sealed });
  const previewQ = useDailyDssrPreview(station.id, date, { enabled: readsPreview });
  const q = sealed ? snapshotQ : previewQ;
  const row = (sealed || readsPreview ? q.data : null) as
    { generatedAt?: string; live?: boolean; snapshotData?: unknown } | null | undefined;

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
      sales: deriveSales(snap),
      tanks: deriveTankMovement(snap),
    };
  }, [row, timeZone]);

  const hasReport = sealed || readsPreview;
  return {
    model,
    loading: hasReport && q.isLoading,
    error: hasReport && q.isError && !row,
    refetch: () => void q.refetch(),
  };
}

export type DssrDay = NonNullable<ReturnType<typeof useDssrDay>['model']>;
