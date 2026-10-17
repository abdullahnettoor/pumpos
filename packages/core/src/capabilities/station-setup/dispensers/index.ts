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
export const dispenserCreateSchema = z.object({
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

/** The Dispenser row and its DISPENSER_CREATED event for a parsed command. */
export function newDispenser(
  data: z.infer<typeof dispenserCreateSchema>,
  ctx: ExecutionContext,
): { dispenser: DispenserUnit; event: DomainEvent } {
  const now = ctx.clock.now().toISOString();
  const dispenser: DispenserUnit = {
    id: ctx.ids.newId(),
    organizationId: ctx.organizationId,
    stationId: data.stationId,
    name: data.name,
    code: data.code,
    status: data.status ?? 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  const event = eventFromContext(ctx, {
    eventType: BusinessEvents.DISPENSER_CREATED,
    aggregateType: 'DispenserUnit',
    aggregateId: dispenser.id,
    stationId: dispenser.stationId,
    payload: { dispenserId: dispenser.id, code: dispenser.code },
  });
  return { dispenser, event };
}

export class CreateDispenser implements UseCase<CreateDispenserCommand, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(
    input: CreateDispenserCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DispenserUnit>> {
    const p = dispenserCreateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid CreateDispenser command', { issues: p.error.flatten() }));
    const { dispenser, event } = newDispenser(p.data, ctx);
    await this.deps.repository.save(dispenser);
    await this.deps.events.publish([event]);
    return ok(dispenser);
  }
}

export class UpdateDispenser implements UseCase<UpdateDispenserCommand, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(
    input: UpdateDispenserCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DispenserUnit>> {
    const p = updateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid UpdateDispenser command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('DispenserUnit', p.data.id));
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
        // Status carries the from/to: taking a pump out of service changes
        // what a shift can open with and stops its nozzles being read (#258),
        // so the audit log must not have it look like a rename.
        payload: {
          dispenserId: updated.id,
          ...(updated.status !== existing.status
            ? { statusFrom: existing.status, statusTo: updated.status }
            : {}),
        },
      }),
    ]);
    return ok(updated);
  }
}

export class DeleteDispenser implements UseCase<{ id: string }, DispenserUnit> {
  constructor(private readonly deps: DispenserDeps) {}
  async execute(input: { id: string }, ctx: ExecutionContext): Promise<Result<DispenserUnit>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('DispenserUnit', input.id));
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
