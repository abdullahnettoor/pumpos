import { z } from 'zod';
import type { InsightsRangeDays, InsightsSales } from '@pump/shared';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeInsightsSales } from './compose.js';
import type { InsightsSalesReader } from './ports.js';

export interface GetInsightsSalesCommand {
  stationId: string;
  /** Range length in Business Days: 7, 30 or 90 (anything else is refused). */
  days: number;
}

const rangeDays = z.union([z.literal(7), z.literal(30), z.literal(90)], {
  message: 'days must be one of 7, 30, 90',
}) satisfies z.ZodType<InsightsRangeDays>;

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  days: rangeDays,
});

export interface GetInsightsSalesDeps {
  reader: InsightsSalesReader;
}

/**
 * One Station's Insights sales block: trend, product mix and Shift
 * performance over the last 7 / 30 / 90 closed Business Days, compared with
 * the previous equal period.
 *
 * Read-only: derives no state and emits no Business Event. Only sealed data
 * (closed-day DSSR snapshots and their Shift Summaries) contributes, so a
 * figure never changes once its day has closed.
 */
export class GetInsightsSales implements UseCase<GetInsightsSalesCommand, InsightsSales> {
  constructor(private readonly deps: GetInsightsSalesDeps) {}

  async execute(
    input: GetInsightsSalesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<InsightsSales>> {
    const p = schema.safeParse(input);
    if (!p.success) {
      return err(validationError('Invalid GetInsightsSales query', { issues: p.error.flatten() }));
    }
    // Station access is the route's to enforce (it authorizes the requested
    // station before building the context); the use case reads under the
    // caller's organization and the station it was asked for.

    const source = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: p.data.days,
    });
    return ok(composeInsightsSales(source));
  }
}
