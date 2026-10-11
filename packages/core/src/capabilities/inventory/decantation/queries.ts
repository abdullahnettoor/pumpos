import { z } from 'zod';
import { isValidBusinessDate } from '@pump/shared';
import { err, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { Decantation, DecantationRepository } from './ports.js';

export interface GetDecantationCommand {
  /** When omitted the caller authorizes the returned Decantation's station. */
  stationId?: string;
  decantationId: string;
}

export class GetDecantation implements UseCase<GetDecantationCommand, Decantation> {
  constructor(private readonly deps: { decantations: DecantationRepository }) {}

  async execute(input: GetDecantationCommand, ctx: ExecutionContext): Promise<Result<Decantation>> {
    const found = await this.deps.decantations.findById(ctx.organizationId, input.decantationId);
    if (!found || (input.stationId && found.stationId !== input.stationId))
      return err(notFoundError('Decantation', input.decantationId));
    return ok(found);
  }
}

const date = z.string().refine(isValidBusinessDate, 'must be a valid YYYY-MM-DD date');
const listSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  from: date.optional(),
  to: date.optional(),
  status: z.enum(['DRAFT', 'PENDING_MEASUREMENT', 'MEASURED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ListDecantationsCommand = z.input<typeof listSchema>;

/** Decantations of a station by Business Date range / status, tank lines grouped. */
export class ListDecantations implements UseCase<ListDecantationsCommand, Decantation[]> {
  constructor(private readonly deps: { decantations: DecantationRepository }) {}

  async execute(
    input: ListDecantationsCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Decantation[]>> {
    const p = listSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid ListDecantations query', { issues: p.error.flatten() }));
    if (p.data.from && p.data.to && p.data.from > p.data.to)
      return err(validationError('from must not be after to'));
    return ok(await this.deps.decantations.list({ organizationId: ctx.organizationId, ...p.data }));
  }
}
