import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export interface Tank {
  id: string;
  organizationId: string;
  stationId: string;
  name: string;
  productId: string;
  capacity: string;
  createdAt: string;
  updatedAt: string;
}

export interface TankRepository extends Repository<Tank> {
  deleteById(id: string): Promise<boolean>;
  listByStation(organizationId: string, stationId: string): Promise<Tank[]>;
}

export interface CreateTankCommand {
  stationId: string;
  name: string;
  productId: string;
  capacity: number | string;
}

export interface UpdateTankCommand {
  id: string;
  name?: string;
  productId?: string;
  capacity?: number | string;
}

const createSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  name: z.string().trim().min(1, 'name is required').max(100),
  productId: z.string().min(1, 'productId is required'),
  capacity: z.coerce.number().positive('capacity must be positive'),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  productId: z.string().min(1).optional(),
  capacity: z.coerce.number().positive().optional(),
});

export interface TankDeps {
  repository: TankRepository;
  events: EventPublisher;
}

export class CreateTank implements UseCase<CreateTankCommand, Tank> {
  constructor(private readonly deps: TankDeps) {}
  async execute(input: CreateTankCommand, ctx: ExecutionContext): Promise<Result<Tank>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateTank command', { issues: p.error.flatten() }));
    const now = ctx.clock.now().toISOString();
    const tank: Tank = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      name: p.data.name,
      productId: p.data.productId,
      capacity: String(p.data.capacity),
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(tank);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.TANK_CREATED,
        aggregateType: 'Tank',
        aggregateId: tank.id,
        stationId: tank.stationId,
        payload: { tankId: tank.id, name: tank.name, productId: tank.productId },
      }),
    ]);
    return ok(tank);
  }
}

export class UpdateTank implements UseCase<UpdateTankCommand, Tank> {
  constructor(private readonly deps: TankDeps) {}
  async execute(input: UpdateTankCommand, ctx: ExecutionContext): Promise<Result<Tank>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateTank command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('Tank', p.data.id));
    const updated: Tank = {
      ...existing,
      name: p.data.name ?? existing.name,
      productId: p.data.productId ?? existing.productId,
      capacity: p.data.capacity !== undefined ? String(p.data.capacity) : existing.capacity,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.TANK_UPDATED,
        aggregateType: 'Tank',
        aggregateId: updated.id,
        stationId: updated.stationId,
        payload: { tankId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}

export class DeleteTank implements UseCase<{ id: string }, Tank> {
  constructor(private readonly deps: TankDeps) {}
  async execute(input: { id: string }, ctx: ExecutionContext): Promise<Result<Tank>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('Tank', input.id));
    await this.deps.repository.deleteById(existing.id);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.TANK_DELETED,
        aggregateType: 'Tank',
        aggregateId: existing.id,
        stationId: existing.stationId,
        payload: { tankId: existing.id },
      }),
    ]);
    return ok(existing);
  }
}
