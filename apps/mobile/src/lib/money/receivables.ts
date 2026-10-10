/**
 * How the receivables summary (`GET /reports/receivables`) reads on screen: the
 * aging split, the "Oldest N days" caption, and the Customer page's tiles. Pure
 * and string-only: every figure (balance, buckets, days, averages) arrives
 * computed by the API; nothing here derives a business number. What is
 * missing stays missing: `null` in, `null` out, so the screens hide a figure
 * instead of showing a zero for it.
 */
import {
  RECEIVABLES_AGING_EDGES,
  RECEIVABLES_SETTLED_SAMPLE,
  type CustomerLastPayment,
  type CustomerMonthFigures,
  type CustomerVehicleSpend,
  type ReceivablesAging,
} from '@pump/shared';
import { compactRupees, plural } from '../format.js';
import { dayLabel } from './statement.js';

export type AgingKey = keyof ReceivablesAging;
export type AgingTone = 'good' | 'warn' | 'bad';

export interface AgingSegment {
  key: AgingKey;
  label: string;
  amount: number;
  /** Percent of the total (0-100); the bar widths. */
  share: number;
  tone: AgingTone;
}

const { recentMaxDays, midMaxDays } = RECEIVABLES_AGING_EDGES;

// The labels and the caption tones cut at the edges the API aged with.
const SEGMENTS: ReadonlyArray<{ key: AgingKey; label: string; tone: AgingTone }> = [
  { key: 'd0_7', label: `0–${recentMaxDays} days`, tone: 'good' },
  { key: 'd8_30', label: `${recentMaxDays + 1}–${midMaxDays} days`, tone: 'warn' },
  { key: 'd30plus', label: `${midMaxDays}+ days`, tone: 'bad' },
];

/** The three buckets with their share of the total; null when nothing is owed (no split to draw). */
export function agingSegments(aging: ReceivablesAging | null | undefined): AgingSegment[] | null {
  if (!aging) return null;
  const total = aging.d0_7 + aging.d8_30 + aging.d30plus;
  if (!(total > 0)) return null;
  return SEGMENTS.map(({ key, label, tone }) => ({
    key,
    label,
    tone,
    amount: aging[key],
    share: (aging[key] / total) * 100,
  }));
}

/** `today`, `1 day`, `18 days`. */
export const daysLabel = (days: number): string => (days <= 0 ? 'today' : plural(days, 'day'));

export interface OldestCaption {
  /** `Oldest 18 days`, `Oldest today`. */
  text: string;
  /** Red in the oldest bucket, amber in the middle one, muted otherwise: the same cuts as the aging split. */
  tone: 'muted' | 'warn' | 'bad';
}

/** The caption under a row's balance; null when the oldest debt is unknown (hidden, never "0 days"). */
export function oldestCaption(days: number | null | undefined): OldestCaption | null {
  if (days == null || !Number.isFinite(days)) return null;
  const tone = days > midMaxDays ? 'bad' : days > recentMaxDays ? 'warn' : 'muted';
  return { text: `Oldest ${daysLabel(days)}`, tone };
}

export interface Tile {
  label: string;
  value: string;
  sub: string;
}

/** "Last payment": the amount, then `18 Sep · 21 days ago`. Null before the first payment. */
export function lastPaymentTile(p: CustomerLastPayment | null | undefined): Tile | null {
  if (!p) return null;
  const when = p.daysAgo <= 0 ? 'today' : `${plural(p.daysAgo, 'day')} ago`;
  return {
    label: 'Last payment',
    value: compactRupees(p.amount),
    sub: [dayLabel(p.entryDate), when].join(' · '),
  };
}

/** "Usually pays in 24 days"; null until the API has enough settled sales to say. */
export function usuallyPaysTile(days: number | null | undefined): Tile | null {
  if (days == null) return null;
  return {
    label: 'Usually pays in',
    value: plural(days, 'day'),
    sub: `avg, last ${RECEIVABLES_SETTLED_SAMPLE} settled sales`,
  };
}

/** `23 slips · 812 L`; litres only when some of it was fuel. */
export function creditTile(m: CustomerMonthFigures): Tile {
  const litres = Math.round(m.litres);
  return {
    label: 'Credit this month',
    value: compactRupees(m.credit),
    sub: [plural(m.slips, 'slip'), litres > 0 ? `${litres.toLocaleString('en-IN')} L` : null]
      .filter(Boolean)
      .join(' · '),
  };
}

/** How the customer settles: the settlement cycle in words. */
export const settlesLabel = (cycle: string | null | undefined): string =>
  cycle === 'EOD' ? 'Settles: end of day' : 'Settles: open account';

export function paidTile(m: CustomerMonthFigures, cycle: string | null | undefined): Tile {
  return { label: 'Paid this month', value: compactRupees(m.paid), sub: settlesLabel(cycle) };
}

export interface VehicleBar extends CustomerVehicleSpend {
  /** Width of the bar relative to the biggest spender (which is 100). */
  pct: number;
}

/** Largest first (as the API returns them), each bar relative to the largest. */
export function vehicleBars(vehicles: readonly CustomerVehicleSpend[]): VehicleBar[] {
  const max = vehicles.reduce((m, v) => Math.max(m, v.amount), 0);
  return vehicles.map((v) => ({ ...v, pct: max > 0 ? Math.max(2, (v.amount / max) * 100) : 0 }));
}
