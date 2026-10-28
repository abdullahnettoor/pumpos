import type { InsightsAttendantVariance } from '@pump/shared';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeAttendantVariance } from './compose.js';
import type { InsightsAttendantVarianceReader } from './ports.js';
import { insightsQuerySchema, type InsightsQueryCommand } from './query.js';

export interface GetInsightsAttendantVarianceDeps {
  reader: InsightsAttendantVarianceReader;
}

/**
 * Cash variance by Attendant over the last 7 / 30 / 90 closed Business Days:
 * the ATTENDANT level of the two-level drawer variance (ADR 0005), from the
 * Drawers in closed Shift Summaries. It is never added to the office count
 * variance.
 *
 * Who may see it (the `reports.attendant` Product Capability and the Role)
 * is the route's to enforce, as for the Attendant Handover Report.
 */
export class GetInsightsAttendantVariance implements UseCase<
  InsightsQueryCommand,
  InsightsAttendantVariance[]
> {
  constructor(private readonly deps: GetInsightsAttendantVarianceDeps) {}

  async execute(
    input: InsightsQueryCommand,
    ctx: ExecutionContext,
  ): Promise<Result<InsightsAttendantVariance[]>> {
    const p = insightsQuerySchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetInsightsAttendantVariance query', {
          issues: p.error.flatten(),
        }),
      );
    }
    const rows = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: p.data.days,
    });
    return ok(composeAttendantVariance(rows));
  }
}
