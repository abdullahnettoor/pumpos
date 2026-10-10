import type { InsightsStockLoss } from '@pump/shared';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeStockLoss } from './compose.js';
import type { InsightsStockLossReader } from './ports.js';
import { insightsQuerySchema, type InsightsQueryCommand } from './query.js';

export interface GetInsightsStockLossDeps {
  reader: InsightsStockLossReader;
}

/**
 * Stock loss by tank over the last 7 / 30 / 90 closed Business Days: Tank Dip
 * variance against book stock, in litres, as a share of litres sold and at the
 * product's cost basis, flagged within / outside tolerance.
 */
export class GetInsightsStockLoss implements UseCase<InsightsQueryCommand, InsightsStockLoss[]> {
  constructor(private readonly deps: GetInsightsStockLossDeps) {}

  async execute(
    input: InsightsQueryCommand,
    ctx: ExecutionContext,
  ): Promise<Result<InsightsStockLoss[]>> {
    const p = insightsQuerySchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetInsightsStockLoss query', { issues: p.error.flatten() }),
      );
    }
    const rows = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: p.data.days,
    });
    return ok(composeStockLoss(rows));
  }
}
