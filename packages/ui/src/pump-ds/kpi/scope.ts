import { shortMonth } from '../../utils/format.js';

/**
 * The words of a KPI tile's period chip (#567). Every tile on a page with a
 * date filter names its period, so the reader can see which figures follow
 * the filter and which are fixed.
 *
 * - `today`: the station's business day.
 * - `{ month }`: a calendar month, shown as its short name (`Oct`). Pass any
 *   business date in the month (`YYYY-MM-DD`) or the month (`YYYY-MM`).
 * - `in-range`: follows the page's date range.
 * - `now`: a balance at this moment (no period).
 */
export type KpiScope = 'today' | 'in-range' | 'now' | { month: string };

const WORDS = { today: 'Today', 'in-range': 'In range', now: 'Now' } as const;

export function formatKpiScope(scope: KpiScope): string {
  if (typeof scope === 'string') return WORDS[scope];
  const m = /^(\d{4})-(\d{2})/.exec(scope.month);
  if (!m) return scope.month;
  return shortMonth(Number(m[2]));
}
