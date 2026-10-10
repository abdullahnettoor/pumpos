import type { RecordHandoverResult } from '@pump/ui';
import {
  num,
  type AssignedDu,
  type HandoverRow,
  type RecordedTerminalEntry,
} from '../../components/handover/model.js';

/**
 * What the attendant sees once their Handover is recorded: their own figures,
 * nothing about the station. Pure.
 *
 * The figures are the server's. A save (`RecordHandoverResult`) and a reload
 * (the Handover the assignment holds) both reduce to one `RecordedDu` (the
 * stored handover row, its litres, its OMC card total and its terminal
 * entries) and everything below reads only that, so the recap cannot differ
 * between the two. Nothing is re-derived from nozzle readings here.
 */

export interface MerchandiseHandoverRecord {
  attendantId?: string;
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
  /** Labels of the Payment Terminals that took card/UPI. */
  terminalLabels: string[];
  /** Card/UPI was declared without a terminal (a Station with none configured). */
  hasAggregateCardUpi: boolean;
  cashDrops: number;
  cashHandedOver: number;
  openingFloat: number;
  variance: number;
  /** ISO time of the latest recorded Handover. */
  recordedAt: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** One DU's recorded Handover, from whichever source holds it. */
interface RecordedDu {
  row: HandoverRow;
  litres: number;
  /** Anonymous OMC card sales are not on the row; the server sums them separately. */
  omcCardSales: number;
  terminalEntries: RecordedTerminalEntry[];
}

const fromResult = (result: RecordHandoverResult): RecordedDu => ({
  row: result.handover,
  litres: sum(result.nozzleReadings.map((r) => num(r.netVolume))),
  omcCardSales: num(result.omcCardSales),
  terminalEntries: result.terminalEntries,
});

const fromAssignment = (du: AssignedDu): RecordedDu | null =>
  du.handover
    ? {
        row: du.handover,
        litres: sum(du.nozzles.map((nz) => num(nz.netVolume))),
        omcCardSales: sum((du.omcSales ?? []).map((l) => num(l.amount))),
        terminalEntries: du.terminalEntries ?? [],
      }
    : null;

/** The session's accepted result for the DU wins (it is available before the refetch). */
function recordedFor(du: AssignedDu, results: Map<string, RecordHandoverResult>) {
  const result = results.get(du.duId);
  return result ? fromResult(result) : fromAssignment(du);
}

/**
 * The recap for the DUs the attendant is accountable for, or null while any of
 * them has no recorded Handover: "recorded" is never reported for a part.
 */
export function buildRecap(input: {
  dus: AssignedDu[];
  /** The server's accepted results from this session, when there are any. */
  results?: RecordHandoverResult[];
  merchandise: MerchandiseHandoverRecord | undefined;
}): HandoverRecap | null {
  const { dus, results = [], merchandise } = input;
  if (dus.length === 0) return null;
  const resultByDu = new Map(results.map((r) => [r.handover.duId, r]));

  const recorded: { du: AssignedDu; rec: RecordedDu }[] = [];
  for (const du of dus) {
    const rec = recordedFor(du, resultByDu);
    if (!rec) return null;
    recorded.push({ du, rec });
  }

  const labels = new Set<string>();
  let aggregateCardUpi = false;
  for (const { du, rec } of recorded) {
    const used = rec.terminalEntries.filter((e) => num(e.cardAmount) + num(e.upiAmount) > 0);
    for (const entry of used) {
      const label = du.terminals.find((t) => t.terminalId === entry.terminalId)?.label;
      if (label) labels.add(label);
    }
    if (used.length === 0 && num(rec.row.cardHandedOver) + num(rec.row.upiHandedOver) > 0)
      aggregateCardUpi = true;
  }

  const field = (pick: (row: HandoverRow) => string | number | null | undefined) =>
    round2(sum(recorded.map(({ rec }) => num(pick(rec.row)))));
  const slipAmount = sum(
    recorded.map(({ rec }) => num(rec.row.creditHandedOver) + rec.omcCardSales),
  );
  const cardUpi = field((r) => num(r.cardHandedOver) + num(r.upiHandedOver));
  const times = recorded.flatMap(({ rec }) => (rec.row.createdAt ? [rec.row.createdAt] : []));

  return {
    duNames: dus.map((du) => du.duName),
    fuelLitres: round2(sum(recorded.map(({ rec }) => rec.litres))),
    fuelAmount: field((r) => r.expectedSales),
    productQuantity: sum((merchandise?.items ?? []).map((i) => num(i.quantity))),
    productAmount: num(merchandise?.totalAmount),
    creditSlips: sum(dus.map((du) => (du.creditSales?.length ?? 0) + (du.omcSales?.length ?? 0))),
    creditAndCardAmount: round2(slipAmount + cardUpi),
    terminalLabels: [...labels],
    hasAggregateCardUpi: aggregateCardUpi,
    cashDrops: field((r) => r.cashDrops),
    cashHandedOver: field((r) => r.cashHandedOver),
    openingFloat: field((r) => r.openingFloat),
    variance: field((r) => r.varianceAmount),
    recordedAt: times.sort().at(-1) ?? null,
  };
}

/** "5:40 pm" in the device's time zone; null for a missing or unreadable ISO time. */
export function formatRecordedTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
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
