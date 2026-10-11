import { z } from 'zod';
import { isValidBusinessDate } from '@pump/shared';
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
  DensityReadingListQuery,
  DensityReadingRepository,
  DensityReadingWithContext,
} from './ports.js';

const date = z.string().refine(isValidBusinessDate, 'must be a valid YYYY-MM-DD date');

export const listDensityReadingsSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  productId: z.string().optional(),
  from: date.optional(),
  to: date.optional(),
  kind: z.enum(['MORNING', 'ADHOC', 'DECANTATION']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type ListDensityReadingsCommand = z.input<typeof listDensityReadingsSchema>;

export class ListDensityReadings implements UseCase<
  ListDensityReadingsCommand,
  DensityReadingWithContext[]
> {
  constructor(private readonly deps: { densityReadings: DensityReadingRepository }) {}

  async execute(
    input: ListDensityReadingsCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DensityReadingWithContext[]>> {
    const p = listDensityReadingsSchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid ListDensityReadings query', { issues: p.error.flatten() }),
      );
    }
    const cmd = p.data;
    if (ctx.stationId && ctx.stationId !== cmd.stationId) {
      return err(notFoundError('Station', cmd.stationId));
    }
    if (cmd.from && cmd.to && cmd.from > cmd.to) {
      return err(validationError('from must not be after to'));
    }

    const query: DensityReadingListQuery = {
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
      productId: cmd.productId,
      from: cmd.from,
      to: cmd.to,
      kind: cmd.kind,
      limit: cmd.limit,
    };

    const readings = await this.deps.densityReadings.list(query);
    return ok(readings);
  }
}
