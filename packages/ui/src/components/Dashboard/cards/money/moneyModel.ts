import { num } from '@pump/shared';
import type { DailyCashBook, DailyCashBookAccount } from '../../../../services/cloud.js';

/**
 * Cash in Hand for the headline tile: the Cash Book's Cash in Hand (Office)
 * account closing. The DSSR is sales-only and never carries it (ADR 0005);
 * null until the Cash Book is read.
 */
export function deriveCashInHand(cashBook: DailyCashBook | null | undefined): number | null {
  const acc = cashBook?.accounts.find((a) => a.accountType === 'CASH_IN_HAND');
  return acc ? num(acc.closing) : null;
}

export interface TrendPoint {
  sales: number;
  closed: boolean;
}
export interface TrendInput {
  trend?: TrendPoint[];
  /** The previous period's per-day series (same length/alignment as `trend`). */
  previousTrend?: TrendPoint[];
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

/**
 * SVG geometry of the trend: sealed solid (gaps skipped), draft dashed from the
 * last sealed point, previous period's own daily series dotted. The Y scale
 * fits the data range with padding (never forced to include 0).
 */
export function buildTrendChart(data: TrendInput, W = 320, H = 70): TrendChart | null {
  const trend = data.trend ?? [];
  if (trend.length === 0) return null;
  const prev = data.previousTrend ?? [];
  const sealedVals = [...trend, ...prev].filter((d) => d.closed).map((d) => d.sales);
  const values = sealedVals.length > 0 ? sealedVals : trend.map((d) => d.sales);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const X = (i: number) => 2 + (i / Math.max(1, trend.length - 1)) * (W - 4);
  const Y = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    return 6 + (1 - (c - min) / (max - min)) * (H - 12);
  };
  const pt = (i: number, v: number) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;

  const sealedIdx = trend.flatMap((d, i) => (d.closed ? [i] : []));
  const sealedLine = sealedIdx.map((i, j) => `${j ? 'L' : 'M'}${pt(i, trend[i].sales)}`).join(' ');
  const lastSealed = sealedIdx.length > 0 ? sealedIdx[sealedIdx.length - 1] : -1;
  const sealedArea =
    sealedIdx.length > 0
      ? `${sealedLine} L${X(lastSealed).toFixed(1)} ${H} L${X(sealedIdx[0]).toFixed(1)} ${H} Z`
      : '';
  const draftIdx = trend.flatMap((_, i) =>
    lastSealed < trend.length - 1 && i >= Math.max(0, lastSealed) ? [i] : [],
  );
  const draftLine = draftIdx.map((i, j) => `${j ? 'L' : 'M'}${pt(i, trend[i].sales)}`).join(' ');

  // Previous period: only sealed days, a gap starts a new sub-path.
  let prevLine = '';
  let open = false;
  prev.slice(0, trend.length).forEach((d, i) => {
    if (!d.closed) {
      open = false;
      return;
    }
    prevLine += `${open ? ' L' : prevLine ? ' M' : 'M'}${pt(i, d.sales)}`;
    open = true;
  });
  const best = bestDayIndex(trend);

  return {
    W,
    H,
    sealedLine,
    sealedArea,
    draftLine,
    prevLine,
    bestCircle: best >= 0 ? { cx: X(best).toFixed(1), cy: Y(trend[best].sales).toFixed(1) } : null,
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
export function officeEntries(
  accounts: readonly DailyCashBookAccount[] | null | undefined,
): OfficeEntry[] {
  const seen = new Set<string>();
  const out: OfficeEntry[] = [];
  const legs: OfficeEntry[] = [];
  for (const a of accounts ?? []) {
    for (const e of a.entries ?? []) legs.push({ ...e, accountName: a.name });
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
