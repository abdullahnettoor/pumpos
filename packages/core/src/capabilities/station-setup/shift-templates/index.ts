import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export interface ShiftTemplate {
  id: string;
  organizationId: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface ShiftTemplateRepository extends Repository<ShiftTemplate> {
  deleteById(id: string): Promise<boolean>;
  listByOrganization(organizationId: string): Promise<ShiftTemplate[]>;
}

export interface CreateShiftTemplateCommand {
  name: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface UpdateShiftTemplateCommand {
  id: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  startTime: z.string().regex(timeRe, 'startTime must be HH:MM'),
  endTime: z.string().regex(timeRe, 'endTime must be HH:MM'),
  isActive: z.boolean().optional(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  startTime: z.string().regex(timeRe).optional(),
  endTime: z.string().regex(timeRe).optional(),
  isActive: z.boolean().optional(),
});

export interface ShiftTemplateDeps {
  repository: ShiftTemplateRepository;
  events: EventPublisher;
}

export class CreateShiftTemplate implements UseCase<CreateShiftTemplateCommand, ShiftTemplate> {
  constructor(private readonly deps: ShiftTemplateDeps) {}
  async execute(input: CreateShiftTemplateCommand, ctx: ExecutionContext): Promise<Result<ShiftTemplate>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateShiftTemplate command', { issues: p.error.flatten() }));
    const tpl: ShiftTemplate = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name: p.data.name,
      startTime: p.data.startTime,
      endTime: p.data.endTime,
      isActive: p.data.isActive ?? true,
    };
    await this.deps.repository.save(tpl);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_TEMPLATE_CREATED,
        aggregateType: 'ShiftTemplate',
        aggregateId: tpl.id,
        payload: { shiftTemplateId: tpl.id, name: tpl.name },
      }),
    ]);
    return ok(tpl);
  }
}

export class UpdateShiftTemplate implements UseCase<UpdateShiftTemplateCommand, ShiftTemplate> {
  constructor(private readonly deps: ShiftTemplateDeps) {}
  async execute(input: UpdateShiftTemplateCommand, ctx: ExecutionContext): Promise<Result<ShiftTemplate>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateShiftTemplate command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('ShiftTemplate', p.data.id));
    const updated: ShiftTemplate = {
      ...existing,
      name: p.data.name ?? existing.name,
      startTime: p.data.startTime ?? existing.startTime,
      endTime: p.data.endTime ?? existing.endTime,
      isActive: p.data.isActive ?? existing.isActive,
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_TEMPLATE_UPDATED,
        aggregateType: 'ShiftTemplate',
        aggregateId: updated.id,
        payload: { shiftTemplateId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}

export class DeleteShiftTemplate implements UseCase<{ id: string }, ShiftTemplate> {
  constructor(private readonly deps: ShiftTemplateDeps) {}
  async execute(input: { id: string }, ctx: ExecutionContext): Promise<Result<ShiftTemplate>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('ShiftTemplate', input.id));
    await this.deps.repository.deleteById(existing.id);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_TEMPLATE_DELETED,
        aggregateType: 'ShiftTemplate',
        aggregateId: existing.id,
        payload: { shiftTemplateId: existing.id },
      }),
    ]);
    return ok(existing);
  }
}
