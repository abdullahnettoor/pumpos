import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export interface Nozzle {
  id: string;
  organizationId: string;
  stationId: string;
  duId: string;
  tankId: string;
  productId: string;
  name: string;
  currentReading: string;
  createdAt: string;
  updatedAt: string;
}

export interface NozzleRepository extends Repository<Nozzle> {
  deleteById(id: string): Promise<boolean>;
  listByStation(organizationId: string, stationId: string): Promise<Nozzle[]>;
}

export interface CreateNozzleCommand {
  stationId: string;
  duId: string;
  tankId: string;
  productId: string;
  name: string;
  currentReading?: number | string;
}

export interface UpdateNozzleCommand {
  id: string;
  duId?: string;
  tankId?: string;
  productId?: string;
  name?: string;
  currentReading?: number | string;
}

const createSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  duId: z.string().min(1, 'duId is required'),
  tankId: z.string().min(1, 'tankId is required'),
  productId: z.string().min(1, 'productId is required'),
  name: z.string().trim().min(1, 'name is required').max(100),
  currentReading: z.coerce.number().min(0).optional(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  duId: z.string().min(1).optional(),
  tankId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  currentReading: z.coerce.number().min(0).optional(),
});

export interface NozzleDeps {
  repository: NozzleRepository;
  events: EventPublisher;
}

export class CreateNozzle implements UseCase<CreateNozzleCommand, Nozzle> {
  constructor(private readonly deps: NozzleDeps) {}
  async execute(input: CreateNozzleCommand, ctx: ExecutionContext): Promise<Result<Nozzle>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateNozzle command', { issues: p.error.flatten() }));
    const now = ctx.clock.now().toISOString();
    const nozzle: Nozzle = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      duId: p.data.duId,
      tankId: p.data.tankId,
      productId: p.data.productId,
      name: p.data.name,
      currentReading: String(p.data.currentReading ?? 0),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(nozzle);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.NOZZLE_CREATED,
        aggregateType: 'Nozzle',
        aggregateId: nozzle.id,
        stationId: nozzle.stationId,
        payload: { nozzleId: nozzle.id, duId: nozzle.duId, tankId: nozzle.tankId, productId: nozzle.productId },
      }),
    ]);
    return ok(nozzle);
  }
}

export class UpdateNozzle implements UseCase<UpdateNozzleCommand, Nozzle> {
  constructor(private readonly deps: NozzleDeps) {}
  async execute(input: UpdateNozzleCommand, ctx: ExecutionContext): Promise<Result<Nozzle>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateNozzle command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('Nozzle', p.data.id));
    const updated: Nozzle = {
      ...existing,
      duId: p.data.duId ?? existing.duId,
      tankId: p.data.tankId ?? existing.tankId,
      productId: p.data.productId ?? existing.productId,
      name: p.data.name ?? existing.name,
      currentReading: p.data.currentReading !== undefined ? String(p.data.currentReading) : existing.currentReading,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.NOZZLE_UPDATED,
        aggregateType: 'Nozzle',
        aggregateId: updated.id,
        stationId: updated.stationId,
        payload: { nozzleId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}

export class DeleteNozzle implements UseCase<{ id: string }, Nozzle> {
  constructor(private readonly deps: NozzleDeps) {}
  async execute(input: { id: string }, ctx: ExecutionContext): Promise<Result<Nozzle>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('Nozzle', input.id));
    await this.deps.repository.deleteById(existing.id);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.NOZZLE_DELETED,
        aggregateType: 'Nozzle',
        aggregateId: existing.id,
        stationId: existing.stationId,
        payload: { nozzleId: existing.id },
      }),
    ]);
    return ok(existing);
  }
}
