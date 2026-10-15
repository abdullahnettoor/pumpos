import {
  deriveTankLevel,
  variancePresentation,
  type VarianceStatusState,
  tankStates,
  type StockStatusState,
  type TankLevel,
  type TankLevelSettings,
  type TankStatusState,
} from '@pump/shared';
import type { DateRange } from '../../pump-ds/date-range/index.js';
import { formatQuantity } from '../../utils/format.js';
import { inWindow } from '../../utils/ledgerWindow.js';

/**
 * The figures of the Inventory page (#536), kept out of the views: the four
 * tiles, the row filters and their counts. Rows are the API's shapes
 * (`/transactions/inventory/*`); only the fields read here are typed.
 */

/** One row of `GET /transactions/inventory/status`. */
export interface TankRow {
  id: string;
  name: string;
  productId: string;
  productName?: string | null;
  productCode?: string | null;
  productUnit?: string | null;
  capacity: number | string;
  currentVolume: number | string;
  daysOfCover?: number | string | null;
  waitingOnDecantation?: boolean;
}

/** One row of `GET /transactions/inventory/items` (merchandise on hand). */
export interface ItemRow {
  productId: string;
  name: string;
  code?: string | null;
  productType?: string | null;
  unit?: string | null;
  quantity: number | string;
}

/** One row of `GET /transactions/inventory/movements`. */
export interface MovementRow {
  id: string;
  businessDate?: string | null;
  productId?: string | null;
  productName?: string | null;
  productUnit?: string | null;
  movementType: string;
  quantity: number | string;
  referenceType?: string | null;
  tankName?: string | null;
}

/** One row of `GET /transactions/inventory/variances` (a stock count). */
export interface VarianceRow {
  id: string;
  businessDate?: string | null;
  productId?: string | null;
  productName?: string | null;
  productUnit?: string | null;
  tankName?: string | null;
  expectedQuantity: number | string;
  actualQuantity: number | string;
  varianceQuantity: number | string;
  reason?: string | null;
}

/** A tank with its level (the same model as every gauge, #520) and its states. */
export interface TankView {
  row: TankRow;
  level: TankLevel;
  states: TankStatusState[];
}

export const tankViews = (rows: readonly TankRow[], levels: TankLevelSettings): TankView[] =>
  rows.map((row) => {
    const level = deriveTankLevel(row, levels);
    return { row, level, states: tankStates(level) };
  });

const isLitre = (unit?: string | null) => !unit?.trim() || /^(l|liters?|litres?)$/i.test(unit);

/**
 * Fuel stock tile: the litre total is the figure; any other unit (CNG in kg)
 * moves into the hint, since litres and kg don't add up.
 */
export function fuelStock(rows: readonly TankRow[]): { value: string; hint: string } {
  const byUnit = new Map<string, number>();
  for (const t of rows) {
    const unit = isLitre(t.productUnit) ? 'L' : t.productUnit!.trim();
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + (Number(t.currentVolume) || 0));
  }
  const entries = [...byUnit].sort((a, b) => Number(b[0] === 'L') - Number(a[0] === 'L'));
  const [head, ...rest] = entries.length ? entries : [['L', 0] as [string, number]];
  return {
    value: formatQuantity(head[1], head[0]),
    hint: [
      ...rest.map(([u, v]) => formatQuantity(v, u)),
      `${rows.length} ${rows.length === 1 ? 'tank' : 'tanks'}`,
    ].join(' · '),
  };
}

/**
 * The stock of the tanks shown, for a filtered list's total: litres (or kg)
 * add up only within one unit, so mixed units have no total (`null`).
 */
export function tanksStock(tanks: readonly TankView[]): string | null {
  const units = new Set(
    tanks.map((t) => (isLitre(t.row.productUnit) ? 'L' : t.row.productUnit!.trim())),
  );
  if (tanks.length === 0 || units.size !== 1) return null;
  return formatQuantity(
    tanks.reduce((acc, t) => acc + t.level.stock, 0),
    [...units][0],
  );
}

/** Low or critical tanks; `critical` decides the tile's alert. */
export const lowTanks = (tanks: readonly TankView[]) => ({
  count: tanks.filter((t) => t.level.tone === 'low' || t.level.tone === 'critical').length,
  critical: tanks.filter((t) => t.level.tone === 'critical').length,
});

/** A merchandise line's stock state; none while it has stock. */
export function itemState(item: Pick<ItemRow, 'quantity'>): StockStatusState | null {
  const q = Number(item.quantity);
  if (!Number.isFinite(q)) return null;
  if (q < 0) return 'oversold';
  if (q === 0) return 'out-of-stock';
  return null;
}

export const itemCounts = (items: readonly ItemRow[]) => ({
  outOfStock: items.filter((i) => itemState(i) === 'out-of-stock').length,
  oversold: items.filter((i) => itemState(i) === 'oversold').length,
});

// ── Row filters ──────────────────────────────────────────────────────────────

export type TankFilter = 'all' | 'low' | 'over' | 'decanting';

export const TANK_FILTERS: Record<TankFilter, (t: TankView) => boolean> = {
  all: () => true,
  low: (t) => t.states.includes('tank-critical') || t.states.includes('tank-low'),
  over: (t) => t.states.includes('tank-over-capacity'),
  decanting: (t) => t.states.includes('tank-waiting-decantation'),
};

export type ItemFilter = 'all' | 'out-of-stock' | 'oversold';

export const ITEM_FILTERS: Record<ItemFilter, (i: ItemRow) => boolean> = {
  all: () => true,
  'out-of-stock': (i) => itemState(i) === 'out-of-stock',
  oversold: (i) => itemState(i) === 'oversold',
};

const has = (q: string, ...values: (string | null | undefined)[]) =>
  values.some((v) => v?.toLowerCase().includes(q));

export const matchesItem = (i: ItemRow, q: string) => has(q, i.name, i.code);

/** Movements in the range, of one type and one product when chosen, newest first. */
export function movementsIn(
  rows: readonly MovementRow[],
  f: { range: DateRange; type: string; productId: string; search: string },
): MovementRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(
    (m) =>
      inWindow(m.businessDate, f.range) &&
      (!f.type || m.movementType === f.type) &&
      (!f.productId || m.productId === f.productId) &&
      (!q || has(q, m.productName, m.movementType, m.tankName, referenceLabel(m.referenceType))),
  );
}

/**
 * Rows each product filter would show, under the other filters (range, type,
 * search): the counts on the product chips. `''` is every product.
 */
export function productCounts(
  rows: readonly MovementRow[],
  f: { range: DateRange; type: string; search: string },
): Record<string, number> {
  const counts: Record<string, number> = { '': 0 };
  for (const m of movementsIn(rows, { ...f, productId: '' })) {
    counts[''] += 1;
    if (m.productId) counts[m.productId] = (counts[m.productId] ?? 0) + 1;
  }
  return counts;
}

/** Distinct products in rows, by name: the product filter's options. */
export function productsOf(
  rows: readonly { productId?: string | null; productName?: string | null }[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows)
    if (r.productId && !seen.has(r.productId)) seen.set(r.productId, r.productName ?? 'Product');
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Rows that are all one product: only then does a quantity column add up. */
export const oneProduct = (rows: readonly { productId?: string | null }[]) =>
  rows.length > 0 && new Set(rows.map((r) => r.productId ?? '')).size === 1;

/** What a stock movement points at, in words; the API sends a code. */
const REFERENCE_LABEL: Record<string, string> = {
  SALE: 'Sale',
  CREDIT_SALE: 'Credit sale',
  OMC_CARD_SALE: 'OMC card sale',
  PURCHASE: 'Purchase',
  ADJUSTMENT: 'Adjustment',
  VARIANCE: 'Stock count',
  OPENING: 'Opening stock',
  OPENING_BALANCE: 'Opening stock',
  ONBOARDING: 'Onboarding',
  reading: 'Nozzle reading',
  decantation_tank_line: 'Decantation',
};

export function referenceLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return (
    REFERENCE_LABEL[code] ??
    code
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** "OpeningBalance" → "Opening balance". */
export const movementTypeLabel = (type: string) =>
  type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/ (\w)/g, (_, c: string) => ` ${c.toLowerCase()}`);

// ── Reconciliations ──────────────────────────────────────────────────────────

/** A stock count's variance as a state: the one balanced rule (#518). */
export const varianceState = (r: Pick<VarianceRow, 'varianceQuantity'>): VarianceStatusState =>
  variancePresentation(r.varianceQuantity, 'stock').state;

/** Stock counts in the range, newest first. */
export const reconciliationsIn = (rows: readonly VarianceRow[], range: DateRange): VarianceRow[] =>
  rows
    .filter((r) => inWindow(r.businessDate, range))
    .sort((a, b) => (b.businessDate ?? '').localeCompare(a.businessDate ?? ''));

/** How many counts each variance chip would show. */
export function reconciliationCounts(
  rows: readonly VarianceRow[],
): Record<'all' | VarianceStatusState, number> {
  const counts = { all: rows.length, short: 0, surplus: 0, balanced: 0 };
  for (const r of rows) counts[varianceState(r)] += 1;
  return counts;
}
