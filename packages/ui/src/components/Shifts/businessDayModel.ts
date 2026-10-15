import { shiftDisplayLabel } from '@pump/shared';

/**
 * A Business Day's figures for the Shifts page (#533): the four day tiles (on
 * Business days, and "Today" on the idle Live shift tab), the shifts in the
 * day, and the day's sales lines. Read from the DSR preview (live day) or the
 * stored DSR (closed day); nothing is recalculated here beyond adding up.
 */

type Snap = Record<string, any>;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const optional = (v: unknown): number | null => (v == null || v === '' ? null : num(v));

export interface DayFigures {
  shiftsIncluded: number;
  /** Net fuel litres of the closed shifts. */
  netVolume: number;
  revenue: number;
  revenueFuel: number;
  /** Product Sales (the snapshot's `revenueMerch`). */
  revenueProducts: number;
  creditTotal: number;
  normalCredit: number;
  fleetCredit: number;
  purchases: number;
  cogs: number;
  grossMargin: number;
  productSales: number;
  /** Σ attendant variance of the closed shifts; null on a snapshot without it. */
  attendantVariance: number | null;
  /** Σ office count variance of the closed shifts. */
  officeVariance: number | null;
}

/** The day's headline figures from a DSR (preview or stored). */
export function dayFigures(snap: Snap | null | undefined): DayFigures {
  const s = snap ?? {};
  const fuel = s.fuel ?? {};
  const pnl = s.pnl ?? {};
  const credit = s.credit ?? {};
  const drawer = s.drawer ?? {};
  return {
    shiftsIncluded: num(s.shiftsIncluded),
    netVolume: num(fuel.totalNetVolume),
    revenue: num(pnl.revenue),
    revenueFuel: num(pnl.revenueFuel),
    revenueProducts: num(pnl.revenueMerch),
    creditTotal: num(credit.total),
    normalCredit: num(credit.normalCredit),
    fleetCredit: num(credit.fleetCredit),
    purchases: num(s.purchases?.total),
    cogs: num(pnl.cogs),
    grossMargin: num(pnl.grossMargin),
    productSales: num(s.merchandise?.salesValue),
    attendantVariance: optional(drawer.totalAttendantVariance),
    officeVariance: optional(drawer.totalCashVariance),
  };
}

export interface DayShiftRow {
  shiftId: string;
  template: string;
  /** `YYYYMMDD-N`, the shift's readable name (#228). */
  label: string;
  /** Null while the shift is open. */
  closedAt: string | null;
  netVolume: number | null;
  expectedDrawerCash: number | null;
  /** Office count variance; null while open. */
  variance: number | null;
}

export interface DayShifts {
  rows: DayShiftRow[];
  /** The open shift sits in the list but not in the totals. */
  openCount: number;
}

/**
 * The shifts of the day: the DSR's closed shifts, plus the open shift (first)
 * when it belongs to this day and the DSR does not list it yet.
 */
export function dayShifts(input: {
  snap: Snap | null | undefined;
  businessDate: string;
  openShift?: {
    id: string;
    templateName?: string | null;
    businessDate?: string | null;
    shiftSequence?: number | null;
  } | null;
}): DayShifts {
  const snap = input.snap ?? {};
  const date = String(snap.businessDate ?? input.businessDate);
  const rows: DayShiftRow[] = ((snap.shifts ?? []) as Snap[]).map((s) => ({
    shiftId: String(s.shiftId),
    template: s.templateName || 'Custom',
    label: shiftDisplayLabel({
      businessDate: s.businessDate ?? date,
      shiftSequence: s.shiftSequence,
      shiftId: s.shiftId,
    }),
    closedAt: s.closedAt ?? null,
    netVolume: s.closedAt ? num(s.netVolume) : null,
    expectedDrawerCash: s.closedAt ? num(s.expectedDrawerCash) : null,
    variance: s.closedAt ? num(s.cashVariance) : null,
  }));
  const open = input.openShift;
  if (open && !rows.some((r) => r.shiftId === open.id)) {
    rows.unshift({
      shiftId: open.id,
      template: open.templateName || 'Custom',
      label: shiftDisplayLabel({
        businessDate: open.businessDate ?? input.businessDate,
        shiftSequence: open.shiftSequence ?? null,
        shiftId: open.id,
      }),
      closedAt: null,
      netVolume: null,
      expectedDrawerCash: null,
      variance: null,
    });
  }
  return { rows, openCount: rows.filter((r) => !r.closedAt).length };
}
