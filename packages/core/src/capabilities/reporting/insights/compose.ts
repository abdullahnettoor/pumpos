import { INSIGHTS_MIN_COMPARABLE_DAYS } from '@pump/shared';
import type { InsightsSales, InsightsTrendDay } from '@pump/shared';
import type { InsightsSalesSource, InsightsTemplateRow } from './ports.js';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/** Percent change of `current` vs `previous` to one decimal; null with no base to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return round1(((current - previous) / previous) * 100);
}

/** Every calendar date from `from` to `to`, inclusive (plain `YYYY-MM-DD`, no timezone). */
export function eachDate(from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  for (let date = from; date <= to;) {
    out.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    date = cursor.toISOString().slice(0, 10);
  }
  return out;
}

/** Litre-metered units; anything else (kg for CNG / Auto-LPG) cannot share a litre mix. */
const isLitre = (unit: string) =>
  ['l', 'litre', 'litres', 'ltr'].includes(unit.trim().toLowerCase());

/**
 * Change of the per-closed-day average, like for like.
 *
 * Raw totals are not comparable when the periods have different coverage (a
 * station that closed 2 days against one that closed 7). So the periods are
 * compared by average per closed day, and only when BOTH have at least
 * `INSIGHTS_MIN_COMPARABLE_DAYS` closed days; otherwise there is no badge.
 * Days still open inside either range are not closed, so they count in
 * neither the totals nor the day counts.
 */
export function periodChange(
  current: { total: number; closedDays: number },
  previous: { total: number; closedDays: number },
): number | null {
  if (
    current.closedDays < INSIGHTS_MIN_COMPARABLE_DAYS ||
    previous.closedDays < INSIGHTS_MIN_COMPARABLE_DAYS
  ) {
    return null;
  }
  return percentChange(current.total / current.closedDays, previous.total / previous.closedDays);
}

function templateAverages(row: InsightsTemplateRow) {
  const n = row.shifts > 0 ? row.shifts : 1;
  return {
    templateId: row.templateId,
    name: row.name,
    shifts: row.shifts,
    avgSales: round2(row.totalSales / n),
    avgVolume: round2(row.totalVolume / n),
    avgCashVariance: round2(row.totalCashVariance / n),
  };
}

/**
 * Compose the Insights sales block from the reader's sealed-data aggregates.
 * Pure: every figure the tab shows is derived here, none in the UI.
 */
export function composeInsightsSales(source: InsightsSalesSource): InsightsSales {
  const { range, days, previous } = source;

  const total = round2(days.reduce((sum, d) => sum + d.sales, 0));
  const previousTotal = round2(previous.sales);
  const closedDays = days.length;

  let best: InsightsSales['best'] = null;
  for (const d of days) {
    if (!best || d.sales > best.sales) best = { date: d.date, sales: d.sales };
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  const trend: InsightsTrendDay[] = range
    ? eachDate(range.from, range.to).map((date) => {
        const day = byDate.get(date);
        return day
          ? { date, sales: day.sales, volume: day.volume, closed: true }
          : { date, sales: 0, volume: 0, closed: false };
      })
    : [];

  const litreRows = source.fuelVolumes.filter((p) => isLitre(p.unit));
  const totalLitres = litreRows.reduce((sum, p) => sum + p.quantity, 0);
  const productMix = litreRows
    .filter((p) => p.quantity > 0)
    .map((p) => ({
      productCode: p.productCode,
      litres: round2(p.quantity),
      share: round1((p.quantity / totalLitres) * 100),
    }))
    .sort((a, b) => b.litres - a.litres);
  const otherUnitFuels = source.fuelVolumes
    .filter((p) => !isLitre(p.unit) && p.quantity > 0)
    .map((p) => ({ productCode: p.productCode, quantity: round2(p.quantity), unit: p.unit }))
    .sort((a, b) => b.quantity - a.quantity);

  const otherTotal = round2(source.other.total);
  const otherPrevious = round2(previous.otherSales);

  return {
    range,
    previousRange: source.previousRange,
    closedDays,
    previousClosedDays: previous.closedDays,
    total,
    previousTotal,
    changePct: periodChange(
      { total, closedDays },
      { total: previousTotal, closedDays: previous.closedDays },
    ),
    average: closedDays > 0 ? round2(total / closedDays) : 0,
    previousAverage: previous.closedDays > 0 ? round2(previousTotal / previous.closedDays) : 0,
    best,
    trend,
    productMix,
    otherUnitFuels,
    otherProducts: {
      total: otherTotal,
      previousTotal: otherPrevious,
      changePct: periodChange(
        { total: otherTotal, closedDays },
        { total: otherPrevious, closedDays: previous.closedDays },
      ),
      top: source.other.top,
    },
    shiftTemplates: source.templates.map(templateAverages),
  };
}
