import { z } from 'zod';
import { isValidBusinessDate } from '@pump/shared';
import { err, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { DecantationLinkRepository, DecantationRepository } from './ports.js';
import { withLinks, type DecantationWithLinks } from './linking.js';

export interface GetDecantationCommand {
  /** When omitted the caller authorizes the returned Decantation's station. */
  stationId?: string;
  decantationId: string;
}

export class GetDecantation implements UseCase<GetDecantationCommand, DecantationWithLinks> {
  constructor(
    private readonly deps: {
      decantations: DecantationRepository;
      links?: DecantationLinkRepository;
    },
  ) {}

  async execute(
    input: GetDecantationCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DecantationWithLinks>> {
    const found = await this.deps.decantations.findById(ctx.organizationId, input.decantationId);
    if (!found || (input.stationId && found.stationId !== input.stationId))
      return err(notFoundError('Decantation', input.decantationId));
    const views = (await this.deps.links?.listViews(ctx.organizationId, [found.id])) ?? [];
    return ok(withLinks(found, views));
  }
}

const date = z.string().refine(isValidBusinessDate, 'must be a valid YYYY-MM-DD date');
export const listDecantationsSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  from: date.optional(),
  to: date.optional(),
  status: z.enum(['DRAFT', 'PENDING_MEASUREMENT', 'MEASURED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ListDecantationsCommand = z.input<typeof listDecantationsSchema>;

/** Decantations of a station by Business Date range / status, tank lines grouped. */
export class ListDecantations implements UseCase<ListDecantationsCommand, DecantationWithLinks[]> {
  constructor(
    private readonly deps: {
      decantations: DecantationRepository;
      links?: DecantationLinkRepository;
    },
  ) {}

  async execute(
    input: ListDecantationsCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DecantationWithLinks[]>> {
    const p = listDecantationsSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid ListDecantations query', { issues: p.error.flatten() }));
    if (p.data.from && p.data.to && p.data.from > p.data.to)
      return err(validationError('from must not be after to'));
    const rows = await this.deps.decantations.list({
      organizationId: ctx.organizationId,
      ...p.data,
    });
    const views =
      (await this.deps.links?.listViews(
        ctx.organizationId,
        rows.map((r) => r.id),
      )) ?? [];
    return ok(rows.map((r) => withLinks(r, views)));
  }
}
