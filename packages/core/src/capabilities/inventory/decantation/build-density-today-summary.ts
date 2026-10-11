import { shiftBusinessDate } from '@pump/shared';
import type {
  DensityReadingWithContext,
  DensityTodayProductSummary,
  DensityTodaySummary,
} from './ports.js';

export interface DensitySummaryProduct {
  id: string;
  name: string;
  code: string;
}

/** Newest first: business date, then recorded instant, then creation instant. */
function newestFirst(a: DensityReadingWithContext, b: DensityReadingWithContext): number {
  if (a.businessDate !== b.businessDate) return a.businessDate < b.businessDate ? 1 : -1;
  const ta = Date.parse(a.recordedAt);
  const tb = Date.parse(b.recordedAt);
  if (ta !== tb) return tb - ta;
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}

/**
 * Assemble the density board summary (pure). `products` is the denominator: the
 * active fuel products with at least one active tank at the station.
 */
export function buildDensityTodaySummary(input: {
  businessDate: string;
  products: DensitySummaryProduct[];
  readings: DensityReadingWithContext[];
}): DensityTodaySummary {
  const { businessDate } = input;
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) dates.push(shiftBusinessDate(businessDate, -i));
  const windowStart = dates[0];

  const byProduct = new Map<string, DensityReadingWithContext[]>();
  for (const r of input.readings) {
    if (r.businessDate < windowStart || r.businessDate > businessDate) continue;
    const list = byProduct.get(r.productId) ?? [];
    list.push(r);
    byProduct.set(r.productId, list);
  }

  const summaries: DensityTodayProductSummary[] = input.products.map((p) => {
    const readings = [...(byProduct.get(p.id) ?? [])].sort(newestFirst);
    const latestToday = readings.find((r) => r.businessDate === businessDate) ?? null;
    const trend14d = dates.map((date) => ({
      date,
      density15: readings.find((r) => r.businessDate === date)?.density15 ?? null,
    }));
    return {
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      latestToday,
      todayRecorded: latestToday != null,
      trend14d,
      trendValues: trend14d.flatMap((t) => (t.density15 == null ? [] : [t.density15])),
      lastReadings: readings.slice(0, 4),
    };
  });

  const recordedCount = summaries.filter((s) => s.todayRecorded).length;
  return {
    businessDate,
    products: summaries,
    recordedCount,
    missingCount: summaries.length - recordedCount,
    missingProducts: summaries
      .filter((s) => !s.todayRecorded)
      .map((s) => ({
        productId: s.productId,
        productName: s.productName,
        productCode: s.productCode,
      })),
    totalProducts: summaries.length,
  };
}
