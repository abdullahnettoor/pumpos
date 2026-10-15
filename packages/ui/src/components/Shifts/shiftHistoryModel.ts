import { variancePresentation, type VarianceStatusState } from '@pump/shared';

/**
 * History's rows and filter (#533): closed shifts newest first, and the office
 * count variance each one closed with, read through the one balanced rule.
 */

export type HistoryFilter = 'all' | VarianceStatusState;

export interface HistoryRowLike {
  generatedAt?: string | null;
  snapshotData?: { cashVariance?: number | string | null } | null;
}

/** Newest first, by when the Shift Summary was taken. */
export const newestFirst = <T extends HistoryRowLike>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? '')));

/** Balanced, Surplus or Short: the shift's office count variance. */
export const historyState = (row: HistoryRowLike): VarianceStatusState =>
  variancePresentation(row.snapshotData?.cashVariance ?? 0, 'cash').state;

export const matchesHistory = (row: HistoryRowLike, filter: HistoryFilter): boolean =>
  filter === 'all' || historyState(row) === filter;

/** How many rows each filter would show. */
export function historyCounts(rows: readonly HistoryRowLike[]): Record<HistoryFilter, number> {
  const out: Record<HistoryFilter, number> = {
    all: rows.length,
    short: 0,
    surplus: 0,
    balanced: 0,
  };
  for (const r of rows) out[historyState(r)] += 1;
  return out;
}

/** The total row's label: every list's total says what it covers. */
export const historyTotalLabel = (shown: number, filtered: boolean): string =>
  filtered ? `Total of ${shown} shown` : `Total of ${shown} ${shown === 1 ? 'shift' : 'shifts'}`;
