import { z } from 'zod';
import type { InsightsRangeDays, SalesInsightsDays } from '@pump/shared';

/** What every Insights read takes: a Station and a range length (7 | 30 | 90; sales also 14). */
export interface InsightsQueryCommand {
  stationId: string;
  /** Range length in Business Days: 7, 30 or 90 (anything else is refused). */
  days: number;
}

const rangeDays = z.union([z.literal(7), z.literal(30), z.literal(90)], {
  message: 'days must be one of 7, 30, 90',
}) satisfies z.ZodType<InsightsRangeDays>;

/** The sales block also serves the dashboard's 14-day trend. */
const salesRangeDays = z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)], {
  message: 'days must be one of 7, 14, 30, 90',
}) satisfies z.ZodType<SalesInsightsDays>;

export const insightsQuerySchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  days: rangeDays,
});

export const salesInsightsQuerySchema = insightsQuerySchema.extend({ days: salesRangeDays });
