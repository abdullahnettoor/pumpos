import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Repository,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { TankRepository } from '../tanks/index.js';

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

export const nozzleCreateSchema = z.object({
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
  tanks: TankRepository;
  events: EventPublisher;
}

/**
 * A Nozzle draws from an active Tank of the same Product at its own Station.
 * Shared by single-nozzle create and dispenser-with-nozzles create (#591), so
 * both refuse the same nozzles with the same messages.
 */
export async function checkNozzleTank(
  tanks: TankRepository,
  nozzle: { stationId: string; tankId: string; productId: string },
  ctx: ExecutionContext,
): Promise<Result<void>> {
  const tank = await tanks.findByIdForUpdate(nozzle.tankId);
  if (
    !tank ||
    tank.organizationId !== ctx.organizationId ||
    tank.stationId !== nozzle.stationId ||
    tank.status !== 'ACTIVE'
  ) {
    return err(notFoundError('Tank', nozzle.tankId));
  }
  if (tank.productId !== nozzle.productId)
    return err(validationError('Nozzle Product must match its Tank Product'));
  return ok(undefined);
}

/** The Nozzle row and its NOZZLE_CREATED event for an already-checked command. */
export function newNozzle(
  data: z.infer<typeof nozzleCreateSchema>,
  ctx: ExecutionContext,
): { nozzle: Nozzle; event: DomainEvent } {
  const now = ctx.clock.now().toISOString();
  const nozzle: Nozzle = {
    id: ctx.ids.newId(),
    organizationId: ctx.organizationId,
    stationId: data.stationId,
    duId: data.duId,
    tankId: data.tankId,
    productId: data.productId,
    name: data.name,
    currentReading: String(data.currentReading ?? 0),
    createdAt: now,
    updatedAt: now,
  };
  const event = eventFromContext(ctx, {
    eventType: BusinessEvents.NOZZLE_CREATED,
    aggregateType: 'Nozzle',
    aggregateId: nozzle.id,
    stationId: nozzle.stationId,
    payload: {
      nozzleId: nozzle.id,
      duId: nozzle.duId,
      tankId: nozzle.tankId,
      productId: nozzle.productId,
    },
  });
  return { nozzle, event };
}

export class CreateNozzle implements UseCase<CreateNozzleCommand, Nozzle> {
  constructor(private readonly deps: NozzleDeps) {}
  async execute(input: CreateNozzleCommand, ctx: ExecutionContext): Promise<Result<Nozzle>> {
    const p = nozzleCreateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid CreateNozzle command', { issues: p.error.flatten() }));
    const tankCheck = await checkNozzleTank(this.deps.tanks, p.data, ctx);
    if (!tankCheck.success) return err(tankCheck.error);
    const { nozzle, event } = newNozzle(p.data, ctx);
    await this.deps.repository.save(nozzle);
    await this.deps.events.publish([event]);
    return ok(nozzle);
  }
}

export class UpdateNozzle implements UseCase<UpdateNozzleCommand, Nozzle> {
  constructor(private readonly deps: NozzleDeps) {}
  async execute(input: UpdateNozzleCommand, ctx: ExecutionContext): Promise<Result<Nozzle>> {
    const p = updateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid UpdateNozzle command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('Nozzle', p.data.id));
    const tankId = p.data.tankId ?? existing.tankId;
    const productId = p.data.productId ?? existing.productId;
    const tank = await this.deps.tanks.findByIdForUpdate(tankId);
    if (
      !tank ||
      tank.organizationId !== ctx.organizationId ||
      tank.stationId !== existing.stationId ||
      tank.status !== 'ACTIVE'
    ) {
      return err(notFoundError('Tank', tankId));
    }
    if (tank.productId !== productId)
      return err(validationError('Nozzle Product must match its Tank Product'));
    const updated: Nozzle = {
      ...existing,
      duId: p.data.duId ?? existing.duId,
      tankId,
      productId,
      name: p.data.name ?? existing.name,
      currentReading:
        p.data.currentReading !== undefined
          ? String(p.data.currentReading)
          : existing.currentReading,
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
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('Nozzle', input.id));
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
