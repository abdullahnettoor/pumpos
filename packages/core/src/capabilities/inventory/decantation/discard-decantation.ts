import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { Decantation, DecantationRepository } from './ports.js';

export const discardDecantationSchema = z.object({
  decantationId: z.string().min(1, 'decantationId is required'),
});
export type DiscardDecantationCommand = z.input<typeof discardDecantationSchema>;

/**
 * Discard a DRAFT Decantation (a tanker that never unloaded). Soft delete: the
 * status becomes DISCARDED and nothing is removed; readers exclude discarded
 * rows. Only a DRAFT may be discarded: once a Decantation is recorded it carries
 * stock facts and is corrected, never discarded.
 */
export class DiscardDecantation implements UseCase<DiscardDecantationCommand, Decantation> {
  constructor(
    private readonly deps: { decantations: DecantationRepository; events: EventPublisher },
  ) {}

  async execute(
    input: DiscardDecantationCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Decantation>> {
    const p = discardDecantationSchema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid DiscardDecantation command', { issues: p.error.flatten() }),
      );
    const existing = await this.deps.decantations.findById(
      ctx.organizationId,
      p.data.decantationId,
    );
    if (!existing || (ctx.stationId && existing.stationId !== ctx.stationId))
      return err(notFoundError('Decantation', p.data.decantationId));
    if (existing.status !== 'DRAFT')
      return err(
        invariantViolation('Only a draft Decantation can be discarded', {
          decantationId: existing.id,
          status: existing.status,
        }),
      );
    const discarded: Decantation = {
      ...existing,
      status: 'DISCARDED',
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.decantations.updateMeasurement(discarded);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DECANTATION_DISCARDED,
        aggregateType: 'Decantation',
        aggregateId: existing.id,
        stationId: existing.stationId,
        businessDayId: existing.businessDayId,
        payload: {
          decantationId: existing.id,
          documentNumber: existing.documentNumber,
          tankerNumber: existing.tankerNumber,
        },
      }),
    ]);
    return ok(discarded);
  }
}
