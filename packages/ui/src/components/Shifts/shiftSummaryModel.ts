import { shiftDisplayLabel } from '@pump/shared';

/**
 * The Shift Summary screen's model (#535): one pure read of the immutable
 * snapshot taken at shift close. The screen renders these rows and figures and
 * never sums raw snapshot keys itself. Totals the snapshot stores are read as
 * stored, never recomputed; a total it does not store is left blank (`null`
 * in `totals`), and the screen says why under the table, as the DSR does.
 */

/** What `GET /shift-summaries` returns per shift (untyped service). */
export interface ShiftSummaryRecord {
  shiftId?: string;
  status?: string | null;
  shiftStatus?: string | null;
  businessDate?: string | null;
  shiftSequence?: number | null;
  generatedAt?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  snapshotData?: Record<string, any> | null;
}

export interface SummaryNozzleRow {
  key: string;
  nozzle: string;
  product: string;
  unit: string;
  opening: number;
  closing: number;
  gross: number;
  testing: number;
  net: number;
}

export interface SummaryFuelRow {
  key: string;
  product: string;
  unit: string;
  gross: number;
  testing: number;
  net: number;
  salesValue: number;
}

export interface SummaryHandoverRow {
  key: string;
  attendant: string;
  du: string;
  cash: number;
  cardUpi: number;
  credit: number;
  expected: number;
  variance: number;
}

export interface SummaryTerminalRow {
  key: string;
  terminal: string;
  provider: string | null;
  /** Who declared card/UPI on this terminal: `Name · DU`, one per contributor. */
  handledBy: string[];
  card: number;
  upi: number;
  total: number;
}

export interface SummaryCreditRow {
  key: string;
  customer: string;
  vehicle: string | null;
  product: string | null;
  quantity: number | null;
  unit: string;
  notes: string | null;
  amount: number;
}

/** One line of the cash reconciliation. */
export interface CashLine {
  key: string;
  label: string;
  amount: number;
  /** How the figure reads: added, taken off, a subtotal, or a variance. */
  role: 'base' | 'plus' | 'minus' | 'result' | 'variance';
}

/** Volume totals as stored. `null` volumes: more than one unit, never added up. */
export interface VolumeTotals {
  /** The shift's one fuel unit; null when the rows mix units (L and kg) or there are none. */
  unit: string | null;
  units: string[];
  gross: number | null;
  testing: number | null;
  net: number | null;
}

export interface ShiftSummary {
  shiftId: string;
  label: string;
  template: string;
  locked: boolean;
  businessDate: string | null;
  generatedAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  closedBy: string;
  warnings: string[];
  nozzles: SummaryNozzleRow[];
  fuel: SummaryFuelRow[];
  volumes: VolumeTotals;
  /** The stored fuel sales value; null for a snapshot without one. */
  fuelSalesValue: number | null;
  handovers: SummaryHandoverRow[];
  /** Σ attendant variance over the handovers, in paise: the handover total's variance. */
  handoverVariance: number;
  terminals: SummaryTerminalRow[];
  credit: SummaryCreditRow[];
  /** The stored credit sales total; null for a snapshot without one. */
  creditTotal: number | null;
  /** Two-level variance (#287): attendant (Handover) and office count are separate. */
  twoLevel: boolean;
  cash: CashLine[];
  drawers: any[];
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string | null =>
  typeof v === 'string' ? v || null : typeof v === 'number' ? String(v) : null;
/** Money added in whole paise, so a sum is the sum of the figures shown. */
const paise = (...amounts: unknown[]): number =>
  amounts.reduce<number>((acc, a) => acc + Math.round(num(a) * 100), 0) / 100;

const productLabel = (name: unknown, code: unknown): string =>
  text(code) ? `${text(name) ?? '—'} (${code})` : (text(name) ?? '—');

/** A nozzle's net volume: the stored figure, else gross − testing as stored per row. */
const nozzleNet = (r: any): number =>
  r.netVolume != null ? num(r.netVolume) : num(r.volumeSold) - num(r.testingVolume);

function readVolumes(snap: Record<string, any>, nozzles: SummaryNozzleRow[]): VolumeTotals {
  const units = Array.from(new Set(nozzles.map((n) => n.unit)));
  const unit = units.length === 1 ? units[0] : null;
  const stored = (key: string): number | null =>
    unit == null || snap[key] == null ? null : num(snap[key]);
  return {
    unit,
    units,
    gross: stored('totalVolumeSold'),
    testing: stored('totalTestingVolume'),
    net: stored('totalNetVolumeSold'),
  };
}

function readCash(snap: Record<string, any>, twoLevel: boolean): CashLine[] {
  const handoverDrops = num(snap.handoverCashDrops ?? snap.cashDrops);
  const closeDrops = num(snap.closeCashDrops);
  const lines: (CashLine | false)[] = [
    { key: 'opening', label: 'Opening floats', amount: num(snap.openingCash), role: 'base' },
    {
      key: 'cashSales',
      label: 'Cash sales (attendant handovers)',
      amount: num(snap.cashSalesSum),
      role: 'plus',
    },
    handoverDrops > 0 && {
      key: 'handoverDrops',
      label: 'Handover drops',
      amount: handoverDrops,
      role: 'minus',
    },
    closeDrops > 0 && {
      key: 'closeDrops',
      label: 'Drops at close',
      amount: closeDrops,
      role: 'minus',
    },
    {
      key: 'expected',
      label: twoLevel ? 'Expected office cash' : 'Expected cash in drawer',
      amount: num(snap.expectedCash ?? snap.openingCash),
      role: 'result',
    },
    { key: 'counted', label: 'Counted at close', amount: num(snap.closingCash), role: 'base' },
    twoLevel && {
      key: 'attendantVariance',
      label: 'Attendant variance (handover)',
      amount: num(snap.attendantVariance),
      role: 'variance',
    },
    {
      key: 'cashVariance',
      // Pre-#287 snapshots keep their single cash variance line.
      label: twoLevel ? 'Office count variance' : 'Cash variance',
      amount: num(snap.cashVariance),
      role: 'variance',
    },
  ];
  return lines.filter((l): l is CashLine => !!l);
}

/** Read a stored Shift Summary into the screen's rows and figures. */
export function readShiftSummary(record: ShiftSummaryRecord): ShiftSummary {
  const snap = record.snapshotData ?? {};
  const shiftId = String(snap.shiftId ?? record.shiftId ?? '');
  const businessDate = record.businessDate ?? null;
  const twoLevel = num(snap.cashVarianceModel ?? 1) >= 2;

  const nozzles: SummaryNozzleRow[] = list(snap.nozzleReadings).map((r, i) => ({
    key: String(r.nozzleId ?? i),
    nozzle: String(r.nozzleName ?? '—'),
    product: productLabel(r.productName, r.productCode),
    unit: String(r.unit || 'L'),
    opening: num(r.openingReading),
    closing: num(r.closingReading),
    gross: num(r.volumeSold),
    testing: num(r.testingVolume),
    net: nozzleNet(r),
  }));

  const fuel: SummaryFuelRow[] = list(snap.fuelByProduct).map((p, i) => ({
    key: String(p.productCode || p.productName || i),
    product: productLabel(p.productName, p.productCode),
    unit: String(p.unit || 'L'),
    gross: num(p.grossVolume),
    testing: num(p.testingVolume),
    net: num(p.netVolume),
    salesValue: num(p.salesValue),
  }));

  const handovers: SummaryHandoverRow[] = list(snap.handovers).map((h, i) => ({
    key: String(h.id ?? i),
    attendant: String(h.attendantName ?? 'Unknown'),
    du: String(h.duCode ?? ''),
    cash: num(h.cashHandedOver),
    cardUpi: paise(h.cardHandedOver, h.upiHandedOver),
    credit: num(h.creditHandedOver),
    expected: num(h.expectedSales),
    variance: num(h.varianceAmount),
  }));

  const terminals: SummaryTerminalRow[] = list(snap.terminalBreakdown).map((t, i) => ({
    key: String(t.terminalId ?? i),
    terminal: String(t.terminalLabel ?? 'Unknown'),
    provider: text(t.provider),
    handledBy: list(t.entries)
      .filter((e) => num(e.card) > 0 || num(e.upi) > 0)
      .map((e) => (text(e.duCode) ? `${e.attendantName} · ${e.duCode}` : String(e.attendantName))),
    card: num(t.card),
    upi: num(t.upi),
    total: paise(t.card, t.upi),
  }));

  const credit: SummaryCreditRow[] = list(snap.creditSales).map((r, i) => ({
    key: String(r.id ?? i),
    customer: String(r.customerName || 'Customer'),
    vehicle: text(r.vehicleNumber),
    product: text(r.productName),
    quantity: r.quantity == null ? null : num(r.quantity),
    unit: String(r.unit || 'L'),
    notes: text(r.notes),
    amount: num(r.amount),
  }));

  return {
    shiftId,
    label: shiftDisplayLabel({
      businessDate,
      shiftSequence: record.shiftSequence ?? null,
      shiftId,
    }),
    template: String(snap.templateName ?? 'Custom'),
    locked: (record.shiftStatus ?? record.status ?? snap.shiftStatus) === 'LOCKED',
    businessDate,
    generatedAt: record.generatedAt ?? snap.generatedAt ?? null,
    openedAt: snap.openedAt ?? record.openedAt ?? null,
    closedAt: snap.closedAt ?? record.closedAt ?? null,
    closedBy: String(snap.closedByName ?? 'Unknown'),
    warnings: list(snap.warnings).map(String),
    nozzles,
    fuel,
    volumes: readVolumes(snap, nozzles),
    fuelSalesValue: snap.totalFuelSalesValue == null ? null : num(snap.totalFuelSalesValue),
    handovers,
    handoverVariance: paise(...handovers.map((h) => h.variance)),
    terminals,
    credit,
    creditTotal: snap.creditSalesTotal == null ? null : num(snap.creditSalesTotal),
    twoLevel,
    cash: readCash(snap, twoLevel),
    drawers: list(snap.drawers),
  };
}

/** Why a stored total is blank: the snapshot does not carry it. */
const notStored = (what: string) => `${what} not stored for this shift`;

/** Why the volume totals read `—` or blank; empty when every total prints. */
export function volumeTotalNotes(v: VolumeTotals): string[] {
  if (v.units.length > 1) return [`volumes not added across ${v.units.join(' and ')}`];
  if (!v.unit) return [];
  const missing = (
    [
      ['gross', v.gross],
      ['testing', v.testing],
      ['net', v.net],
    ] as const
  )
    .filter(([, value]) => value == null)
    .map(([name]) => name);
  if (missing.length === 0) return [];
  const names =
    missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
  return [notStored(`${names} volume${missing.length > 1 ? 's' : ''}`)];
}

/** The fuel-by-product notes: the volume notes, plus a sales value the snapshot lacks. */
export function fuelTotalNotes(s: ShiftSummary): string[] {
  return [
    ...volumeTotalNotes(s.volumes),
    ...(s.fuelSalesValue == null ? [notStored('sales value total')] : []),
  ];
}

export function creditTotalNotes(s: ShiftSummary): string[] {
  return s.creditTotal == null ? [notStored('credit sales total')] : [];
}

/** One line under a table: `Total: a; b.`, or null when every total prints. */
export function totalNote(notes: string[]): string | null {
  return notes.length > 0 ? `Total: ${notes.join('; ')}.` : null;
}

/**
 * Where the shift's business day stands against the station's current one,
 * without repeating either date (the details row shows the shift's day).
 */
export function businessDayContext(
  businessDate: string | null,
  currentBusinessDate: string,
): string | null {
  if (!businessDate) return null;
  if (businessDate < currentBusinessDate)
    return "A past business day: a credit sale logged here belongs to this shift, not today's.";
  if (businessDate === currentBusinessDate) return "Today's business day.";
  return null;
}
