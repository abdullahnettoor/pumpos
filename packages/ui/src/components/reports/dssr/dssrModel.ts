import { readDssrOmcCard, shiftDisplayLabel, variancePresentation } from '@pump/shared';
import type { PumpStatus } from '../../../pump-ds/index.js';
import { formatMoney } from '../../../utils/format.js';

/**
 * The DSR screen's section models (#532): one pure read of a stored DSR
 * snapshot or a live preview, so the screen renders figures and never sums raw
 * snapshot keys itself. The PDF (`dssrDoc`) reads the same model and prints the
 * screen's columns (`dssrColumns`), so the two never disagree (#580).
 */

/** What the DSR reads return (the services are untyped): a stored snapshot row or a preview. */
export interface DssrRow {
  id?: string;
  businessDate?: string;
  generatedAt?: string;
  /** Set by the preview: the Business Day is still open, so the figures can change. */
  live?: boolean;
  lateEntryCount?: number | string;
  snapshotData?: Record<string, any> | null;
}

export interface FuelProductRow {
  key: string;
  product: string;
  unit: string;
  gross: number;
  testing: number;
  net: number;
  salesValue: number;
}

export interface NozzleRow {
  key: string;
  nozzle: string;
  product: string;
  unit: string;
  gross: number;
  testing: number;
  net: number;
}

export interface StockVarianceRow {
  key: string;
  /** Tank name (fuel) or product name (merchandise). */
  name: string;
  /** The product in the tank; null for merchandise, where the name is the product. */
  product: string | null;
  unit: string;
  book: number;
  actual: number;
  variance: number;
  status: Extract<PumpStatus, 'balanced' | 'surplus' | 'short'>;
}

export interface ShiftRow {
  key: string;
  label: string;
  template: string;
  closedAt: string | null;
  netVolume: number;
  /** Null for shifts closed before two-level variance (#287). */
  attendantVariance: number | null;
  officeVariance: number;
}

export interface AttendantRow {
  key: string;
  attendant: string;
  variance: number;
}

export interface FigureLine {
  label: string;
  value: string;
}

export interface DssrDay {
  businessDate: string;
  generatedAt: string | null;
  live: boolean;
  lateEntryCount: number;
  warnings: string[];
  shiftsIncluded: number;
  margin: {
    revenue: number;
    revenueFuel: number;
    revenueMerch: number;
    cogs: number;
    cogsFuel: number;
    cogsMerch: number;
    grossMargin: number;
  };
  sales: FigureLine[];
  fuel: {
    rows: FuelProductRow[];
    /**
     * The snapshot's own totals, so the total row is the stored figure. `net`
     * is null for a snapshot that stores no `totalNetVolume`: it is never
     * derived from gross and testing.
     */
    totals: { gross: number; testing: number; net: number | null; salesValue: number };
    /** Fuel units on the day (L, kg). More than one: volumes are never added across them. */
    units: string[];
  };
  nozzles: NozzleRow[];
  fuelStock: StockVarianceRow[];
  merchandiseStock: StockVarianceRow[];
  shifts: ShiftRow[];
  attendants: AttendantRow[];
  drawerTotals: { attendantVariance: number | null; officeVariance: number | null };
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const optionalNum = (v: unknown): number | null => (v == null ? null : num(v));

const stockRows = (rows: any[], withProduct: boolean, fallbackUnit: string): StockVarianceRow[] =>
  rows.map((v, i) => {
    const variance = num(v.varianceQuantity);
    return {
      key: `${v.tankId ?? v.productId ?? i}-${i}`,
      name: (withProduct ? v.tankName : v.productName) || 'Unknown',
      product: withProduct ? v.productName || 'Unknown' : null,
      unit: v.unit || fallbackUnit,
      book: num(v.expectedQuantity),
      actual: num(v.actualQuantity),
      variance,
      // One balanced rule and one word set for every variance (#518).
      status: variancePresentation(variance, 'stock').state,
    };
  });

/**
 * The sales summary lines, in the order the report has always printed them,
 * closing on the day's gross margin.
 * Output GST and VAT stay on separate lines: fuel VAT is outside GST (T5).
 */
function salesLines(snap: Record<string, any>): FigureLine[] {
  const credit = snap.credit || {};
  const gst = (snap.salesTax?.gst || {}) as Record<string, number>;
  const vat = num(snap.salesTax?.vat?.vat);
  const omcCard = readDssrOmcCard(snap);
  const lines: FigureLine[] = [
    { label: 'Merchandise sales', value: formatMoney(snap.merchandise?.salesValue) },
    { label: 'Normal credit sales', value: formatMoney(credit.normalCredit) },
    { label: 'Fleet credit sales', value: formatMoney(credit.fleetCredit) },
  ];
  // ADR 0001: OMC card fuel settles to the OMC Wallet; only snapshots that carry it show it.
  if (omcCard) lines.push({ label: 'OMC card sales', value: formatMoney(omcCard.total) });
  lines.push({ label: 'Purchases', value: formatMoney(snap.purchases?.total) });
  if (num(gst.total) > 0) {
    lines.push({ label: 'Merchandise taxable value', value: formatMoney(gst.taxable) });
    lines.push(
      num(gst.igst) > 0
        ? { label: 'Output GST on sales (IGST)', value: formatMoney(gst.igst) }
        : {
            label: 'Output GST on sales (CGST / SGST)',
            value: `${formatMoney(gst.cgst)} / ${formatMoney(gst.sgst)}`,
          },
    );
  }
  if (vat > 0) lines.push({ label: 'Output VAT on fuel', value: formatMoney(vat) });
  // Last, as the report has always printed it; the Gross margin tile repeats it (#583).
  lines.push({ label: 'Gross margin', value: formatMoney(snap.pnl?.grossMargin) });
  return lines;
}

/** Reads one DSR row into the screen's section models. */
export function readDssrDay(row: DssrRow): DssrDay {
  const snap: Record<string, any> = row.snapshotData || {};
  const fuel = snap.fuel || {};
  const pnl = snap.pnl || {};
  const businessDate = String(row.businessDate ?? snap.businessDate ?? '');
  const byProduct = list(fuel.byProduct);
  const gross = num(fuel.totalGrossVolume ?? fuel.totalVolume);
  const testing = num(fuel.totalTestingVolume);
  const drawer = snap.drawer || {};

  return {
    businessDate,
    generatedAt: row.generatedAt ?? snap.generatedAt ?? null,
    live: row.live === true,
    lateEntryCount: num(row.lateEntryCount),
    warnings: list(snap.warnings).map(String),
    shiftsIncluded: num(snap.shiftsIncluded),
    margin: {
      revenue: num(pnl.revenue),
      revenueFuel: num(pnl.revenueFuel),
      revenueMerch: num(pnl.revenueMerch),
      cogs: num(pnl.cogs),
      cogsFuel: num(pnl.cogsFuel),
      cogsMerch: num(pnl.cogsMerch),
      grossMargin: num(pnl.grossMargin),
    },
    sales: salesLines(snap),
    fuel: {
      rows: byProduct.map((p, i) => ({
        key: `${p.productId ?? p.productName ?? 'product'}-${i}`,
        product: `${p.productName || 'Unknown'}${p.productCode ? ` (${p.productCode})` : ''}`,
        unit: p.unit || 'L',
        gross: num(p.grossVolume),
        testing: num(p.testingVolume),
        net: num(p.netVolume),
        salesValue: num(p.salesValue),
      })),
      totals: {
        gross,
        testing,
        net: optionalNum(fuel.totalNetVolume),
        salesValue: num(fuel.totalSalesValue),
      },
      units: Array.from(new Set(byProduct.map((p) => String(p.unit || 'L')))),
    },
    nozzles: list(fuel.nozzles).map((n, i) => ({
      key: `${n.nozzleId ?? n.nozzleName ?? 'nozzle'}-${i}`,
      nozzle: n.nozzleName || 'Unknown',
      product: n.productName || 'Unknown',
      unit: n.unit || 'L',
      gross: num(n.grossVolume),
      testing: num(n.testingVolume),
      net: num(n.netVolume),
    })),
    fuelStock: stockRows(list(snap.fuelStockVariance), true, 'L'),
    merchandiseStock: stockRows(list(snap.merchandiseStockVariance), false, 'Nos'),
    shifts: list(snap.shifts).map((s, i) => ({
      key: String(s.shiftId ?? i),
      label: shiftDisplayLabel({
        businessDate,
        shiftSequence: s.shiftSequence,
        shiftId: s.shiftId,
      }),
      template: s.templateName || 'Custom',
      closedAt: s.closedAt ?? null,
      netVolume: num(s.netVolume),
      attendantVariance: optionalNum(s.attendantVariance),
      officeVariance: num(s.cashVariance),
    })),
    attendants: list(drawer.attendants).map((a, i) => ({
      key: `${a.attendantId ?? a.attendantName ?? 'attendant'}-${a.duName ?? ''}-${i}`,
      attendant: `${a.attendantName ?? 'Attendant'}${a.duName ? ` · ${a.duName}` : ''}`,
      variance: num(a.variance),
    })),
    drawerTotals: {
      attendantVariance: optionalNum(drawer.totalAttendantVariance),
      officeVariance: optionalNum(drawer.totalCashVariance),
    },
  };
}

/**
 * Where the day stands (Business Day Status in GLOSSARY.md): a stored snapshot
 * is Sealed; a preview of the Current Business Date is Open (Live); a preview
 * of an earlier day is a Draft (ended, not yet closed).
 */
export function dssrDayStatus(
  row: Pick<DssrRow, 'live'>,
  businessDate: string,
  currentBusinessDate: string,
): Extract<PumpStatus, 'day-open' | 'day-draft' | 'day-sealed'> {
  if (row.live !== true) return 'day-sealed';
  return businessDate >= currentBusinessDate ? 'day-open' : 'day-draft';
}
