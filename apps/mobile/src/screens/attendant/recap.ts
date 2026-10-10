import type { RecordHandoverResult } from '@pump/ui';
import { num, type AssignedDu } from '../../components/handover/model.js';

/**
 * What the attendant sees once their Handover is recorded: their own figures,
 * nothing about the station. Pure. Built from the server's accepted result in
 * the session that saved, and from the Handover the assignment holds after a
 * reload (both describe the same record; the result is just available sooner).
 */

export interface MerchandiseHandoverRecord {
  totalAmount?: string | number | null;
  items?: { quantity?: string | number | null }[];
}

export interface HandoverRecap {
  duNames: string[];
  fuelLitres: number;
  fuelAmount: number;
  productQuantity: number;
  productAmount: number;
  creditSlips: number;
  /** Credit + fuel-card slips plus card/UPI takings. */
  creditAndCardAmount: number;
  hasCardUpi: boolean;
  cashDrops: number;
  cashHandedOver: number;
  openingFloat: number;
  variance: number;
  /** ISO time of the latest recorded Handover. */
  recordedAt: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every Drawer has a Handover on record: nothing left to declare. */
export const allDusRecorded = (dus: AssignedDu[]): boolean =>
  dus.length > 0 && dus.every((du) => du.handover != null);

/** Litres and value metered past the opening reading, net of testing. */
function fuelFromNozzles(du: AssignedDu): { litres: number; amount: number } {
  let litres = 0;
  let amount = 0;
  for (const nz of du.nozzles) {
    if (nz.closingReading == null) continue;
    const net = Math.max(0, nz.closingReading - nz.openingReading - num(nz.testingVolume));
    litres += net;
    amount += net * num(nz.unitPrice);
  }
  return { litres, amount };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildRecap(input: {
  dus: AssignedDu[];
  /** The server's accepted results from this session, when there are any. */
  results?: RecordHandoverResult[];
  merchandise: MerchandiseHandoverRecord | undefined;
}): HandoverRecap {
  const { dus, results = [], merchandise } = input;
  const resultByDu = new Map(results.map((r) => [r.handover.duId, r]));

  let fuelLitres = 0;
  let fuelAmount = 0;
  let slipAmount = 0;
  let cardUpi = 0;
  let cashDrops = 0;
  let cashHandedOver = 0;
  let openingFloat = 0;
  let variance = 0;
  const recordedTimes: string[] = [];

  for (const du of dus) {
    const result = resultByDu.get(du.duId);
    const row = du.handover as Record<string, unknown> | null;
    if (result) {
      fuelLitres += sum(result.nozzleReadings.map((r) => num(r.netVolume)));
      fuelAmount += num(result.expectedFuelSales);
      slipAmount += num(result.creditSales) + num(result.omcCardSales);
      cardUpi += num(result.handover.cardHandedOver) + num(result.handover.upiHandedOver);
      cashDrops += num(result.handover.cashDrops);
      cashHandedOver += num(result.handover.cashHandedOver);
      openingFloat += num(result.handover.openingFloat);
      variance += num(result.varianceAmount);
      recordedTimes.push(result.handover.createdAt);
    } else if (row) {
      const fuel = fuelFromNozzles(du);
      fuelLitres += fuel.litres;
      fuelAmount += fuel.amount;
      slipAmount += num(row.creditHandedOver as string);
      cardUpi += num(row.cardHandedOver as string) + num(row.upiHandedOver as string);
      cashDrops += num(row.cashDrops as string);
      cashHandedOver += num(row.cashHandedOver as string);
      openingFloat += num(row.openingFloat as string);
      variance += num(row.varianceAmount as string);
      if (row.createdAt) recordedTimes.push(row.createdAt as string);
    }
  }

  const slips = dus.reduce(
    (n, du) => n + (du.creditSales?.length ?? 0) + (du.omcSales?.length ?? 0),
    0,
  );
  return {
    duNames: dus.map((du) => du.duName),
    fuelLitres: round2(fuelLitres),
    fuelAmount: round2(fuelAmount),
    productQuantity: sum((merchandise?.items ?? []).map((i) => num(i.quantity))),
    productAmount: num(merchandise?.totalAmount),
    creditSlips: slips,
    creditAndCardAmount: round2(slipAmount + cardUpi),
    hasCardUpi: cardUpi > 0,
    cashDrops: round2(cashDrops),
    cashHandedOver: round2(cashHandedOver),
    openingFloat: round2(openingFloat),
    variance: round2(variance),
    recordedAt: recordedTimes.sort().at(-1) ?? null,
  };
}

export type VarianceTone = 'good' | 'bad' | 'warn';

/** Balanced within ₹1; short is a problem, over is worth a look. */
export function varianceBadge(variance: number): { label: string; tone: VarianceTone } {
  if (Math.abs(variance) < 1) return { label: 'Balanced', tone: 'good' };
  return variance < 0
    ? { label: `Short ₹${Math.abs(Math.round(variance)).toLocaleString('en-IN')}`, tone: 'bad' }
    : { label: `Over ₹${Math.round(variance).toLocaleString('en-IN')}`, tone: 'warn' };
}

/** Whole minutes since the shift opened; null when the opening time is unknown. */
export function minutesOnShift(openedAt: string | null | undefined, now: number): number | null {
  if (!openedAt) return null;
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened)) return null;
  return Math.max(0, Math.floor((now - opened) / 60_000));
}

export function formatOnShift(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
