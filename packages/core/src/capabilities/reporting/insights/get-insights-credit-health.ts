import type { InsightsCreditHealth } from '@pump/shared';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeCreditHealth } from './compose.js';
import type { InsightsCreditHealthReader } from './ports.js';
import { insightsQuerySchema, type InsightsQueryCommand } from './query.js';

export interface GetInsightsCreditHealthDeps {
  reader: InsightsCreditHealthReader;
}

/**
 * Credit health over the last 7 / 30 / 90 closed Business Days: Credit Sales
 * given (by Business Date) against Collections received (by Entry Date, as
 * they are Office Records), the change in receivables and the credit share of
 * sales.
 */
export class GetInsightsCreditHealth implements UseCase<
  InsightsQueryCommand,
  InsightsCreditHealth
> {
  constructor(private readonly deps: GetInsightsCreditHealthDeps) {}

  async execute(
    input: InsightsQueryCommand,
    ctx: ExecutionContext,
  ): Promise<Result<InsightsCreditHealth>> {
    const p = insightsQuerySchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetInsightsCreditHealth query', { issues: p.error.flatten() }),
      );
    }
    const source = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: p.data.days,
    });
    return ok(composeCreditHealth(source));
  }
}
