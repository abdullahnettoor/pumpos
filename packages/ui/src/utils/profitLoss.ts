/**
 * Period P&L arithmetic (ADR 0005).
 *
 * Gross margin comes from the DSSR, keyed by the sales day (business date).
 * Expenses and other income are Office Records keyed by their entry date
 * (station calendar date). The two date axes are joined on the plain
 * `YYYY-MM-DD` string; a date can carry sales, office money, or both.
 */

export interface SalesDayMargin {
  /** Business date (sales day), `YYYY-MM-DD`. */
  date: string;
  grossMargin: number;
  live?: boolean;
}

export interface OfficeRecordRow {
  entryDate?: string | null;
  amount?: number | string | null;
  status?: string | null;
  stationId?: string | null;
}

export interface ProfitLossDay {
  date: string;
  live: boolean;
  hasSales: boolean;
  grossMargin: number;
  expenses: number;
  otherIncome: number;
  netProfit: number;
}

export interface ProfitLossTotals {
  grossMargin: number;
  expenses: number;
  otherIncome: number;
  netProfit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum non-voided office records per entry date within [from, to] for one station. */
export function sumOfficeByEntryDate(
  rows: OfficeRecordRow[] | undefined,
  opts: { from: string; to: string; stationId?: string | null },
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    const d = r.entryDate;
    if (!d || d < opts.from || d > opts.to) continue;
    if (r.status === 'VOIDED') continue;
    if (opts.stationId && r.stationId && r.stationId !== opts.stationId) continue;
    out.set(d, (out.get(d) ?? 0) + Number(r.amount || 0));
  }
  return out;
}

/**
 * Join sales-day gross margin with office expenses/income by entry date.
 * Returns days newest-first plus period totals.
 */
export function buildProfitLoss(input: {
  from: string;
  to: string;
  stationId?: string | null;
  salesDays: SalesDayMargin[];
  expenses?: OfficeRecordRow[];
  income?: OfficeRecordRow[];
}): { days: ProfitLossDay[]; totals: ProfitLossTotals } {
  const range = { from: input.from, to: input.to, stationId: input.stationId };
  const exp = sumOfficeByEntryDate(input.expenses, range);
  const inc = sumOfficeByEntryDate(input.income, range);
  const sales = new Map<string, SalesDayMargin>();
  for (const s of input.salesDays) {
    if (s.date >= input.from && s.date <= input.to) sales.set(s.date, s);
  }

  const dates = new Set<string>([...sales.keys(), ...exp.keys(), ...inc.keys()]);
  const days: ProfitLossDay[] = Array.from(dates)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => {
      const s = sales.get(date);
      const grossMargin = round2(Number(s?.grossMargin || 0));
      const expenses = round2(exp.get(date) ?? 0);
      const otherIncome = round2(inc.get(date) ?? 0);
      return {
        date,
        live: !!s?.live,
        hasSales: !!s,
        grossMargin,
        expenses,
        otherIncome,
        netProfit: round2(grossMargin - expenses + otherIncome),
      };
    });

  const totals = days.reduce<ProfitLossTotals>(
    (acc, d) => ({
      grossMargin: round2(acc.grossMargin + d.grossMargin),
      expenses: round2(acc.expenses + d.expenses),
      otherIncome: round2(acc.otherIncome + d.otherIncome),
      netProfit: round2(acc.netProfit + d.netProfit),
    }),
    { grossMargin: 0, expenses: 0, otherIncome: 0, netProfit: 0 },
  );
  return { days, totals };
}
