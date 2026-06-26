import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export type DispenserStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';

export interface DispenserUnit {
  id: string;
  organizationId: string;
  stationId: string;
  name: string;
  code: string;
  status: DispenserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DispenserRepository extends Repository<DispenserUnit> {
  deleteById(id: string): Promise<boolean>;
  listByStation(organizationId: string, stationId: string): Promise<DispenserUnit[]>;
}

export interface CreateDispenserCommand {
  stationId: string;
  name: string;
  code: string;
  status?: DispenserStatus;
}

export interface UpdateDispenserCommand {
  id: string;
  name?: string;
  code?: string;
  status?: DispenserStatus;
}

const statusEnum = z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']);
const createSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  name: z.string().trim().min(1, 'name is required').max(100),
  code: z.string().trim().min(1, 'code is required').max(50),
  status: statusEnum.optional(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  status: statusEnum.optional(),
});

export interface DispenserDeps {
  repository: DispenserRepository;
  events: EventPublisher;
}

export class CreateDispenser implements UseCase<CreateDispenserCommand, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(input: CreateDispenserCommand, ctx: ExecutionContext): Promise<Result<DispenserUnit>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateDispenser command', { issues: p.error.flatten() }));
    const now = ctx.clock.now().toISOString();
    const du: DispenserUnit = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      name: p.data.name,
      code: p.data.code,
      status: p.data.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(du);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DISPENSER_CREATED,
        aggregateType: 'DispenserUnit',
        aggregateId: du.id,
        stationId: du.stationId,
        payload: { dispenserId: du.id, code: du.code },
      }),
    ]);
    return ok(du);
  }
}

export class UpdateDispenser implements UseCase<UpdateDispenserCommand, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(input: UpdateDispenserCommand, ctx: ExecutionContext): Promise<Result<DispenserUnit>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateDispenser command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('DispenserUnit', p.data.id));
    const updated: DispenserUnit = {
      ...existing,
      name: p.data.name ?? existing.name,
      code: p.data.code ?? existing.code,
      status: p.data.status ?? existing.status,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DISPENSER_UPDATED,
        aggregateType: 'DispenserUnit',
        aggregateId: updated.id,
        stationId: updated.stationId,
        payload: { dispenserId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}

export class DeleteDispenser implements UseCase<{ id: string }, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(input: { id: string }, ctx: ExecutionContext): Promise<Result<DispenserUnit>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('DispenserUnit', input.id));
    await this.deps.repository.deleteById(existing.id);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DISPENSER_DELETED,
        aggregateType: 'DispenserUnit',
        aggregateId: existing.id,
        stationId: existing.stationId,
        payload: { dispenserId: existing.id },
      }),
    ]);
    return ok(existing);
  }
}
