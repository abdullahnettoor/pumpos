/**
 * Home's tiles, tank gauges and money position. Pure derivations over the
 * payloads the existing read endpoints return (DSSR preview, inventory status,
 * customer and supplier lists); the screen only renders them.
 */
import { deriveTankLevel, formatDaysOfCover } from '@pump/shared';
import type { TankLevelSettings, TankTone } from '@pump/shared';
import { MONEY_TERMS, stockOfCapacity } from '@pump/ui';
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
      detail:
        typeof credit.count === 'number' ? plural(credit.count, 'slip') : MONEY_TERMS.receivable,
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

/** A gauge's colour: the shared tank-level tone (#520), from the station's tank levels. */
export type TankGaugeLevel = TankTone;

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
  /** The headline, as on desktop (#603, #609): `13,000 L` (kg for CNG). */
  stock: string;
  /** Under it: `of 20,000 L · 65%`; '' without a capacity. */
  detail: string;
  /**
   * "2.6 days" / "0.9 day": how long the stock lasts at the last 7 closed days'
   * selling rate. Computed by the server; '' when there is no sales history
   * (the gauge shows nothing).
   */
  cover: string;
  /** A pending Decantation for this tank means current book stock is incomplete. */
  waitingOnDecantation: boolean;
}

export function deriveTanks(
  rows: readonly unknown[] | undefined,
  tankLevels: TankLevelSettings,
): TankGauge[] {
  return ((rows ?? []) as Snapshot[]).map((t) => {
    const level = deriveTankLevel(
      {
        capacity: num(t.capacity),
        currentVolume: num(t.currentVolume),
        daysOfCover: t.daysOfCover as number | string | null | undefined,
        waitingOnDecantation: t.waitingOnDecantation === true,
      },
      tankLevels,
    );
    const unit = typeof t.productUnit === 'string' ? t.productUnit : null;
    const figures = stockOfCapacity(level.stock, level.capacity, unit, level.pct);
    return {
      id: String(t.id),
      title: String(t.productCode || t.productName || t.name),
      tankName: String(t.name ?? ''),
      pct: level.pct,
      fill: level.fill,
      level: level.tone,
      stock: figures.stock,
      detail: figures.detail,
      cover: formatDaysOfCover(t.daysOfCover),
      waitingOnDecantation: level.waitingOnDecantation,
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
