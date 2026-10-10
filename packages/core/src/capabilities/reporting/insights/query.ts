import { z } from 'zod';
import type { InsightsRangeDays } from '@pump/shared';

/** What every Insights read takes: a Station and a range length (7 | 30 | 90). */
export interface InsightsQueryCommand {
  stationId: string;
  /** Range length in Business Days: 7, 30 or 90 (anything else is refused). */
  days: number;
}

const rangeDays = z.union([z.literal(7), z.literal(30), z.literal(90)], {
  message: 'days must be one of 7, 30, 90',
}) satisfies z.ZodType<InsightsRangeDays>;

export const insightsQuerySchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  days: rangeDays,
});
