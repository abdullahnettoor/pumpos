/**
 * History's rows (#533): closed shifts newest first, and what the total row
 * covers.
 */

export interface HistoryRowLike {
  generatedAt?: string | null;
}

/** Newest first, by when the Shift Summary was taken. */
export const newestFirst = <T extends HistoryRowLike>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => String(b.generatedAt ?? '').localeCompare(String(a.generatedAt ?? '')));

/** The total row's label: it says how many shifts it covers. */
export const historyTotalLabel = (count: number): string =>
  `Total of ${count} ${count === 1 ? 'shift' : 'shifts'}`;
