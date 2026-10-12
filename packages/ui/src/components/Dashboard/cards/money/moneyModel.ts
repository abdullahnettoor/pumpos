import { num } from '@pump/shared';
import { cashAccountTotals } from '../../../../utils/cashBook.js';

type Row = Record<string, any>;

/**
 * Cash in Hand for the headline tile: the day snapshot's figure first, then the
 * live Cash Book's Cash in Hand account, then the cash accounts' total.
 */
export function deriveCashInHand(snap: Row | null | undefined, cashBook: Row | null | undefined) {
  const accounts: Row[] = cashBook?.accounts ?? [];
  return num(
    snap?.cashInHand ??
      snap?.cashInHandClosing ??
      accounts.find((a) => a.accountType === 'CASH_IN_HAND')?.closing ??
      cashAccountTotals(accounts as any).closing,
  );
}

export interface TrendPoint {
  sales: number;
  closed: boolean;
}
export interface TrendInput {
  trend?: TrendPoint[];
  average: number;
  previousAverage?: number | null;
}

export interface TrendChart {
  W: number;
  H: number;
  sealedLine: string;
  sealedArea: string;
  draftLine: string;
  prevLine: string;
  bestCircle: { cx: string; cy: string } | null;
}

/** Highest-selling sealed (closed) day; -1 when none is sealed. */
export function bestDayIndex(trend: TrendPoint[]): number {
  let bestIdx = -1;
  let bestVal = -1;
  trend.forEach((d, i) => {
    if (d.closed && d.sales > bestVal) {
      bestVal = d.sales;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** SVG geometry of the trend line: sealed solid, draft dashed, previous-average baseline. */
export function buildTrendChart(data: TrendInput, W = 320, H = 70): TrendChart | null {
  const trend = data.trend ?? [];
  if (trend.length === 0) return null;
  const values = trend.map((d) => d.sales);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const X = (i: number) => 2 + (i / Math.max(1, trend.length - 1)) * (W - 4);
  const Y = (v: number) => 6 + (1 - (v - min) / (max - min || 1)) * (H - 12);

  const sealedCount = trend.filter((d) => d.closed).length;
  const pathFor = (from: number, to: number) =>
    trend
      .slice(from, to)
      .map((d, j) => `${j ? 'L' : 'M'}${X(from + j).toFixed(1)} ${Y(d.sales).toFixed(1)}`)
      .join(' ');

  const sealedLine = pathFor(0, sealedCount);
  const sealedArea =
    sealedCount > 0
      ? `${sealedLine} L${X(sealedCount - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z`
      : '';
  const draftLine =
    sealedCount < trend.length ? pathFor(Math.max(0, sealedCount - 1), trend.length) : '';
  const prevY = Y(data.previousAverage ?? data.average).toFixed(1);
  const prevLine = `M${X(0).toFixed(1)} ${prevY} L${X(trend.length - 1).toFixed(1)} ${prevY}`;
  const best = bestDayIndex(trend);

  return {
    W,
    H,
    sealedLine,
    sealedArea,
    draftLine,
    prevLine,
    bestCircle: best >= 0 ? { cx: X(best).toFixed(1), cy: Y(trend[best]!.sales).toFixed(1) } : null,
  };
}

export interface OfficeEntry {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  sourceType: string;
  sourceId: string | null;
  notes: string | null;
  createdAt: string;
  accountName: string;
}

/** Account-to-account moves post one ledger row to each account, sharing a source id. */
const TRANSFER_SOURCES = new Set(['TRANSFER', 'DEPOSIT']);

/**
 * Every Office Record of the Cash Book, newest first. A transfer or deposit
 * posts to two accounts; it is one record, kept once (its outgoing leg).
 */
export function officeEntries(accounts: readonly Row[] | null | undefined): OfficeEntry[] {
  const seen = new Set<string>();
  const out: OfficeEntry[] = [];
  const legs: OfficeEntry[] = [];
  for (const a of accounts ?? []) {
    for (const e of (a.entries ?? []) as Row[]) legs.push({ ...(e as any), accountName: a.name });
  }
  // Outgoing legs first so a transfer is represented by the account it left.
  legs.sort((x, y) => Number(y.direction === 'out') - Number(x.direction === 'out'));
  for (const e of legs) {
    if (TRANSFER_SOURCES.has(e.sourceType) && e.sourceId) {
      const key = `${e.sourceType}:${e.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(e);
  }
  return out.sort((a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0));
}
