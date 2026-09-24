/**
 * Period Profit & Loss (ADR 0005).
 *
 * Gross margin comes from each sales day's DSSR (`pnl`), keyed by business
 * date. Expenses and other income are Office Records keyed by entry date. The
 * two date axes meet on the plain `YYYY-MM-DD` string: a date can carry sales,
 * office money, or both. Pure — the API reads the inputs.
 */

/** One sales day: the DSSR `pnl` block of its snapshot or live preview. */
export interface ProfitLossSalesDay {
  date: string;
  live: boolean;
  pnl: Record<string, unknown> | null | undefined;
}

/** Office money summed per entry date. */
export interface ProfitLossOfficeDay {
  date: string;
  expenses: number;
  otherIncome: number;
}

export interface ProfitLossProductMargin {
  productId: string;
  name: string;
  code: string;
  kind: string;
  quantity: number;
  revenue: number;
  cogs: number;
  margin: number;
  marginPct: number;
}

export interface ProfitLossFigures {
  revenueFuel: number;
  revenueMerch: number;
  revenue: number;
  cogsFuel: number;
  cogsMerch: number;
  cogs: number;
  grossMargin: number;
  expenses: number;
  otherIncome: number;
  netProfit: number;
}

export interface ProfitLossDay extends ProfitLossFigures {
  date: string;
  live: boolean;
  hasSales: boolean;
}

export interface ProfitLossReport {
  from: string;
  to: string;
  /** Newest first. */
  days: ProfitLossDay[];
  totals: ProfitLossFigures & { marginPct: number };
  byProduct: ProfitLossProductMargin[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

const SALES_KEYS = [
  'revenueFuel',
  'revenueMerch',
  'revenue',
  'cogsFuel',
  'cogsMerch',
  'cogs',
  'grossMargin',
] as const;

export function composeProfitLoss(input: {
  from: string;
  to: string;
  salesDays: ProfitLossSalesDay[];
  officeDays: ProfitLossOfficeDay[];
}): ProfitLossReport {
  const inRange = (d: string) => d >= input.from && d <= input.to;
  const sales = new Map(input.salesDays.filter((s) => inRange(s.date)).map((s) => [s.date, s]));
  const office = new Map(input.officeDays.filter((o) => inRange(o.date)).map((o) => [o.date, o]));

  const dates = [...new Set([...sales.keys(), ...office.keys()])].sort((a, b) => (a < b ? 1 : -1));
  const days: ProfitLossDay[] = dates.map((date) => {
    const s = sales.get(date);
    const o = office.get(date);
    const p = s?.pnl ?? {};
    const figures = Object.fromEntries(SALES_KEYS.map((k) => [k, round2(num(p[k]))])) as Record<
      (typeof SALES_KEYS)[number],
      number
    >;
    const expenses = round2(o?.expenses ?? 0);
    const otherIncome = round2(o?.otherIncome ?? 0);
    return {
      date,
      live: !!s?.live,
      hasSales: !!s,
      ...figures,
      expenses,
      otherIncome,
      netProfit: round2(figures.grossMargin - expenses + otherIncome),
    };
  });

  const zero: ProfitLossFigures = {
    revenueFuel: 0,
    revenueMerch: 0,
    revenue: 0,
    cogsFuel: 0,
    cogsMerch: 0,
    cogs: 0,
    grossMargin: 0,
    expenses: 0,
    otherIncome: 0,
    netProfit: 0,
  };
  const totals = days.reduce<ProfitLossFigures>((acc, d) => {
    const next = { ...acc };
    for (const k of Object.keys(zero) as (keyof ProfitLossFigures)[])
      next[k] = round2(acc[k] + d[k]);
    return next;
  }, zero);

  const products = new Map<string, ProfitLossProductMargin>();
  for (const s of sales.values()) {
    const rows = (s.pnl?.byProduct as Array<Record<string, unknown>> | undefined) ?? [];
    for (const bp of rows) {
      const id = str(bp.productId);
      if (!id) continue;
      const cur = products.get(id) ?? {
        productId: id,
        name: str(bp.name),
        code: str(bp.code),
        kind: str(bp.kind),
        quantity: 0,
        revenue: 0,
        cogs: 0,
        margin: 0,
        marginPct: 0,
      };
      cur.quantity = round2(cur.quantity + num(bp.quantity));
      cur.revenue = round2(cur.revenue + num(bp.revenue));
      cur.cogs = round2(cur.cogs + num(bp.cogs));
      cur.margin = round2(cur.margin + num(bp.margin));
      products.set(id, cur);
    }
  }
  const byProduct = [...products.values()]
    .map((r) => ({ ...r, marginPct: pct(r.margin, r.revenue) }))
    .sort((a, b) => b.margin - a.margin);

  return {
    from: input.from,
    to: input.to,
    days,
    totals: { ...totals, marginPct: pct(totals.grossMargin, totals.revenue) },
    byProduct,
  };
}
