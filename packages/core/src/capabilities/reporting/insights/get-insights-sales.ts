import { z } from 'zod';
import { INSIGHTS_RANGE_DAYS, type InsightsSales } from '@pump/shared';
import { err, forbiddenError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeInsightsSales } from './compose.js';
import type { InsightsSalesReader } from './ports.js';

export interface GetInsightsSalesCommand {
  stationId: string;
  /** Range length in Business Days: 7, 30 or 90. */
  days: number;
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  days: z.number().refine((n) => (INSIGHTS_RANGE_DAYS as readonly number[]).includes(n), {
    message: `days must be one of ${INSIGHTS_RANGE_DAYS.join(', ')}`,
  }),
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
    if (ctx.stationId && ctx.stationId !== p.data.stationId) {
      return err(forbiddenError('No access to this station'));
    }

    const source = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: p.data.days as 7 | 30 | 90,
    });
    return ok(composeInsightsSales(source));
  }
}
