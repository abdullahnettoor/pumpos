import { formatDayMonth, shortMonth } from '../../utils/format.js';

/**
 * The period a KPI figure covers (#567, revised by #604).
 *
 * - `today`: the station's business day.
 * - `{ month }`: a calendar month, shown as its short name (`Oct`). Pass any
 *   business date in the month (`YYYY-MM-DD`) or the month (`YYYY-MM`).
 * - `in-range`: follows the page's date range.
 * - `now`: a balance at this moment. A balance has no period, so it is never
 *   labelled (#604).
 * - `this-shift`: the open Shift so far (#533).
 * - `{ day }`: one Business Day other than today, shown as `14 Oct` (#533).
 *
 * Where it shows (#604): when every tile in a strip covers the same period the
 * strip names it once (`KpiStrip` `scope`), and the tiles carry no chip. A tile
 * shows its own chip only when the tiles of one strip cover different periods.
 */
export type KpiScope =
  'today' | 'in-range' | 'now' | 'this-shift' | { month: string } | { day: string };

const WORDS = {
  today: 'Today',
  'in-range': 'In range',
  now: 'Now',
  'this-shift': 'This shift',
} as const;

export function formatKpiScope(scope: KpiScope): string {
  if (typeof scope === 'string') return WORDS[scope];
  if ('day' in scope) return formatDayMonth(scope.day);
  const m = /^(\d{4})-(\d{2})/.exec(scope.month);
  if (!m) return scope.month;
  return shortMonth(Number(m[2]));
}

/**
 * The period a scope covers, as a comparable key: the keyword, the month
 * (`YYYY-MM`) or the day (`YYYY-MM-DD`). Never the label: Oct 2025 and Oct 2026
 * read the same but are different periods.
 */
function scopeKey(scope: KpiScope): string {
  if (typeof scope === 'string') return scope;
  if ('day' in scope) return `day:${scope.day.slice(0, 10)}`;
  return `month:${scope.month.slice(0, 7)}`;
}

/** Two scopes cover the same period. */
export function sameKpiScope(a: KpiScope, b: KpiScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

/**
 * The chip a tile shows, or null (#604): never for a balance (`now`), and never
 * when its strip already names the same period.
 */
export function kpiTileChip(tile: KpiScope | undefined, strip?: KpiScope): string | null {
  if (!tile || tile === 'now') return null;
  if (strip && sameKpiScope(tile, strip)) return null;
  return formatKpiScope(tile);
}

/**
 * The period a strip names once, or null (#604): only when every tile shares
 * one period. A balance (`now`) or an unscoped tile has no period, so a strip
 * holding one is mixed and names nothing.
 */
export function sharedKpiScope(scopes: readonly (KpiScope | undefined)[]): KpiScope | null {
  const [first, ...rest] = scopes;
  if (!first || first === 'now') return null;
  return rest.every((s) => !!s && s !== 'now' && sameKpiScope(s, first)) ? first : null;
}
