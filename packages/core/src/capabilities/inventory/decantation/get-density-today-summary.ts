import { z } from 'zod';
import { isValidBusinessDate, resolveBusinessDate } from '@pump/shared';
import {
  err,
  notFoundError,
  ok,
  validationError,
  type ExecutionContext,
  type Result,
  type UseCase,
} from '../../../kernel/index.js';
import type {
  DensityReadingRepository,
  DensityTodaySummary,
} from './ports.js';

export const getDensityTodaySummarySchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  businessDate: z.string().refine(isValidBusinessDate, 'must be a valid YYYY-MM-DD date').optional(),
});

export type GetDensityTodaySummaryCommand = z.input<typeof getDensityTodaySummarySchema>;

export class GetDensityTodaySummary
  implements UseCase<GetDensityTodaySummaryCommand, DensityTodaySummary>
{
  constructor(private readonly deps: { densityReadings: DensityReadingRepository }) {}

  async execute(
    input: GetDensityTodaySummaryCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DensityTodaySummary>> {
    const p = getDensityTodaySummarySchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetDensityTodaySummary query', { issues: p.error.flatten() }),
      );
    }
    const cmd = p.data;
    if (ctx.stationId && ctx.stationId !== cmd.stationId) {
      return err(notFoundError('Station', cmd.stationId));
    }

    const businessDate =
      cmd.businessDate ??
      resolveBusinessDate({
        timeZone: ctx.timeZone,
        dayStartsAt: ctx.businessDayStartsAt,
      });

    const summary = await this.deps.densityReadings.getTodaySummary(
      ctx.organizationId,
      cmd.stationId,
      businessDate,
    );

    return ok(summary);
  }
}
