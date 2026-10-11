/**
 * Home's tiles, tank gauges and money position. Pure derivations over the
 * payloads the existing read endpoints return (DSSR preview, inventory status,
 * customer and supplier lists); the screen only renders them.
 */
import { formatDaysOfCover } from '@pump/shared';
import { num } from '../num.js';
import { plural } from '../format.js';
import { dayCashVariance, type CashVariance } from '../cashVariance.js';
import { owing, totalOwed, type MoneyParty } from '../money/parties.js';
import type { Snapshot } from './sales.js';

export type Tone = 'default' | 'good' | 'warn' | 'bad';

export interface Tile {
  /** Null when there is nothing to show yet (the tile prints "—"). */
  value: number | null;
  detail: string;
  tone: Tone;
}
export interface HomeTiles {
  /** Both cash-variance levels (ADR 0005), shared with the Shift Summary. */
  variance: CashVariance;
  margin: Tile;
  credit: Tile;
  purchases: Tile;
}

function marginTile(snap: Snapshot): Tile {
  const pnl = snap.pnl ?? {};
  if (num(pnl.cogs) <= 0) return { value: null, detail: 'Set product costs', tone: 'default' };
  const margin = num(pnl.grossMargin);
  const revenue = num(pnl.revenue);
  return {
    value: margin,
    detail: revenue > 0 ? `${((margin / revenue) * 100).toFixed(1)}% of sales` : 'Sales − COGS',
    tone: margin < 0 ? 'bad' : 'good',
  };
}

export function deriveTiles(snap: Snapshot): HomeTiles {
  const credit = snap.credit ?? {};
  const purchases = snap.purchases ?? {};
  return {
    variance: dayCashVariance(snap),
    margin: marginTile(snap),
    credit: {
      value: num(credit.total),
      detail: typeof credit.count === 'number' ? plural(credit.count, 'slip') : 'Receivable',
      tone: num(credit.total) > 0 ? 'warn' : 'default',
    },
    purchases: {
      value: num(purchases.total),
      detail:
        typeof purchases.count === 'number'
          ? plural(purchases.count, 'purchase')
          : 'Stock received',
      tone: 'default',
    },
  };
}

/** Fill levels below which a tank gauge turns red / amber. */
const TANK_RED_BELOW = 25;
const TANK_AMBER_BELOW = 40;

export type TankGaugeLevel = 'red' | 'amber' | 'ok' | 'unknown';

export const tankLevel = (pct: number): Exclude<TankGaugeLevel, 'unknown'> =>
  pct < TANK_RED_BELOW ? 'red' : pct < TANK_AMBER_BELOW ? 'amber' : 'ok';

export interface TankGauge {
  id: string;
  /** Product code (MS, HSD), else the product name. */
  title: string;
  tankName: string;
  /** Percent of capacity; above 100 for book stock over capacity; null without a capacity. */
  pct: number | null;
  /** Tube fill, 0–100. */
  fill: number;
  level: TankGaugeLevel;
  volume: string;
  /**
   * "2.6 days" / "0.9 day": how long the stock lasts at the last 7 closed days'
   * selling rate. Computed by the server; '' when there is no sales history
   * (the gauge shows nothing).
   */
  cover: string;
}

const unitText = (unit: unknown): string => (typeof unit === 'string' ? unit.trim() : '');
const isLitre = (unit: unknown) => !unitText(unit) || /^(l|litre|liter)s?$/i.test(unitText(unit));

function volumeLabel(volume: number, unit: unknown): string {
  if (isLitre(unit)) return `${(volume / 1000).toFixed(1)} KL`;
  return `${Math.round(volume).toLocaleString('en-IN')} ${unitText(unit)}`;
}

export function deriveTanks(rows: readonly unknown[] | undefined): TankGauge[] {
  return ((rows ?? []) as Snapshot[]).map((t) => {
    const capacity = num(t.capacity);
    const volume = Math.max(0, num(t.currentVolume));
    const pct = capacity > 0 ? (volume / capacity) * 100 : null;
    const rounded = pct === null ? null : Math.round(pct);
    return {
      id: String(t.id),
      title: String(t.productCode || t.productName || t.name),
      tankName: String(t.name ?? ''),
      pct: rounded,
      fill: pct === null ? 0 : Math.min(100, pct),
      level: pct === null ? 'unknown' : tankLevel(pct),
      volume: volumeLabel(volume, t.productUnit),
      cover: formatDaysOfCover(t.daysOfCover),
    };
  });
}

export interface MoneyLine {
  value: number;
  parties: number;
  detail: string;
}
export interface MoneyPosition {
  toCollect: MoneyLine;
  toPay: MoneyLine;
}

/** Who is owed and how much, by the Money tab's rule (`owing`, `totalOwed`): one balance rule everywhere. */
function dues(rows: readonly unknown[] | undefined): { value: number; parties: number } {
  const owed = owing((rows ?? []) as MoneyParty[]);
  return { value: totalOwed(owed), parties: owed.length };
}

/** Customer receivables and supplier payables (positive balances only). */
export function deriveMoney(
  customers: readonly unknown[] | undefined,
  suppliers: readonly unknown[] | undefined,
): MoneyPosition {
  const c = dues(customers);
  const s = dues(suppliers);
  return {
    toCollect: {
      ...c,
      detail: c.parties ? `${plural(c.parties, 'customer')} to collect` : 'Nothing due',
    },
    toPay: {
      ...s,
      detail: s.parties ? `${plural(s.parties, 'supplier')} to pay` : 'Nothing to pay',
    },
  };
}
