import { z } from 'zod';
import { isValidBusinessDate, resolveBusinessDate, shiftBusinessDate } from '@pump/shared';
import {
  err,
  notFoundError,
  ok,
  validationError,
  type ExecutionContext,
  type Result,
  type UseCase,
} from '../../../kernel/index.js';
import { buildDensityTodaySummary } from './build-density-today-summary.js';
import type { DensityReadingRepository, DensityTodaySummary } from './ports.js';

export const getDensityTodaySummarySchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  businessDate: z
    .string()
    .refine(isValidBusinessDate, 'must be a valid YYYY-MM-DD date')
    .optional(),
});

export type GetDensityTodaySummaryCommand = z.input<typeof getDensityTodaySummarySchema>;

export class GetDensityTodaySummary implements UseCase<
  GetDensityTodaySummaryCommand,
  DensityTodaySummary
> {
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
        now: ctx.clock.now(),
        timeZone: ctx.timeZone,
        dayStartsAt: ctx.businessDayStartsAt,
      });

    const [products, readings] = await Promise.all([
      this.deps.densityReadings.listFuelProductsWithActiveTanks(ctx.organizationId, cmd.stationId),
      this.deps.densityReadings.list({
        organizationId: ctx.organizationId,
        stationId: cmd.stationId,
        from: shiftBusinessDate(businessDate, -13),
        to: businessDate,
        limit: 1000,
      }),
    ]);
    const summary = buildDensityTodaySummary({ businessDate, products, readings });

    return ok(summary);
  }
}
