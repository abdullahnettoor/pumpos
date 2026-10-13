/**
 * Range figures for the Reports overview KPI strip, read from DSSR snapshots.
 * Pure: no React, no fetching. The component never touches raw snapshot keys.
 *
 * The DSSR is sales-only (ADR 0005), so "cash" here is cash received for sales
 * by the shifts' Drawers. Collections are Office Records and live in the Cash Book.
 */
import { num, round2 } from './money.js';
import { readSnapshot, unitLabel, wholeQuantityLabel, type Snapshot } from './sales-headline.js';

/**
 * Net volume sold on one day, per display unit. Reads the per-product roll-up
 * so litres and kilograms never add up; falls back to the day total
 * (`fuel.totalNetVolume`), then the pre-net key (`totalVolumeSold`), as litres.
 */
export function readDssrNetVolume(snap: Snapshot): Record<string, number> {
  const byProduct = (snap.fuel?.byProduct ?? []) as Snapshot[];
  const out: Record<string, number> = {};
  if (byProduct.length > 0) {
    for (const p of byProduct) {
      const unit = unitLabel(p.unit);
      out[unit] = (out[unit] ?? 0) + num(p.netVolume ?? p.grossVolume);
    }
    return out;
  }
  const total = snap.fuel?.totalNetVolume ?? snap.totalVolumeSold;
  return total == null ? {} : { L: num(total) };
}

/** Cash received for the day's sales; null for a snapshot frozen before it was recorded (#516). */
export function readDssrCashSales(snap: Snapshot): number | null {
  return snap.cashSales == null ? null : num(snap.cashSales);
}

export interface DssrRangeKpis {
  /** Number of DSSRs in the range. */
  count: number;
  /** "4,360 L", or "100 L · 40 kg". */
  volumeLabel: string;
  /** Σ cash sales of the days that recorded it; null when none did. */
  cashSales: number | null;
  /** Days in the range frozen before cash sales were recorded. */
  daysWithoutCash: number;
}

export function deriveDssrRangeKpis(range: readonly unknown[] | undefined): DssrRangeKpis {
  const perUnit = new Map<string, number>();
  let cash: number | null = null;
  let daysWithoutCash = 0;
  const rows = range ?? [];
  for (const row of rows) {
    const snap = readSnapshot(row);
    for (const [unit, qty] of Object.entries(readDssrNetVolume(snap)))
      perUnit.set(unit, (perUnit.get(unit) ?? 0) + qty);
    const c = readDssrCashSales(snap);
    if (c == null) daysWithoutCash += 1;
    else cash = (cash ?? 0) + c;
  }
  return {
    count: rows.length,
    volumeLabel:
      [...perUnit].map(([unit, qty]) => wholeQuantityLabel(qty, unit)).join(' · ') || '0 L',
    cashSales: cash == null ? null : round2(cash),
    daysWithoutCash,
  };
}
