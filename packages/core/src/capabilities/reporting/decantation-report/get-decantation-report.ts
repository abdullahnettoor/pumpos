import { z } from 'zod';
import { isValidBusinessDate } from '@pump/shared';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type {
  DecantationReport,
  DecantationReportFilters,
  DecantationReportReader,
} from './ports.js';
import { composeDecantationReport } from './compose.js';

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  from: z.string().refine(isValidBusinessDate, 'from must be a valid YYYY-MM-DD date'),
  to: z.string().refine(isValidBusinessDate, 'to must be a valid YYYY-MM-DD date'),
});

export class GetDecantationReport implements UseCase<DecantationReportFilters, DecantationReport> {
  constructor(private readonly deps: { reader: DecantationReportReader }) {}

  async execute(
    input: DecantationReportFilters,
    ctx: ExecutionContext,
  ): Promise<Result<DecantationReport>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return err(
        validationError('Invalid Decantation Report filters', {
          issues: parsed.error.flatten(),
        }),
      );
    }
    if (parsed.data.from > parsed.data.to) {
      return err(validationError('from date must not be after to date'));
    }
    const source = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      ...parsed.data,
    });
    const report = composeDecantationReport(
      source,
      { organizationId: ctx.organizationId, ...parsed.data },
      ctx.clock.now().toISOString(),
    );
    return ok(report);
  }
}
