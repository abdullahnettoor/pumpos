import { z } from 'zod';
import { BusinessEvents, conflictError, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export type BusinessDayStatus = 'OPEN' | 'CLOSED';

export interface BusinessDay {
  id: string;
  organizationId: string;
  stationId: string;
  businessDate: string; // YYYY-MM-DD
  status: BusinessDayStatus;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessDayRepository extends Repository<BusinessDay> {
  findOpenByStation(organizationId: string, stationId: string): Promise<BusinessDay | null>;
}

export interface OpenBusinessDayCommand {
  stationId: string;
  businessDate?: string;
}

export interface CloseBusinessDayCommand {
  businessDayId: string;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const openSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  businessDate: z.string().regex(dateRe, 'businessDate must be YYYY-MM-DD').optional(),
});

export interface BusinessDayDeps {
  repository: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Open the operating/accounting day for a station. A station may have at most
 * one OPEN business day; the previous day must be closed first.
 */
export class OpenBusinessDay implements UseCase<OpenBusinessDayCommand, BusinessDay> {
  constructor(private readonly deps: BusinessDayDeps) {}
  async execute(input: OpenBusinessDayCommand, ctx: ExecutionContext): Promise<Result<BusinessDay>> {
    const p = openSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid OpenBusinessDay command', { issues: p.error.flatten() }));

    const existingOpen = await this.deps.repository.findOpenByStation(ctx.organizationId, p.data.stationId);
    if (existingOpen) {
      return err(conflictError('A business day is already open for this station; close it before opening a new one', { businessDayId: existingOpen.id, businessDate: existingOpen.businessDate }));
    }

    const now = ctx.clock.now();
    const businessDate = p.data.businessDate ?? now.toISOString().slice(0, 10);
    const nowIso = now.toISOString();
    const day: BusinessDay = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      businessDate,
      status: 'OPEN',
      openedBy: ctx.actorId ?? 'system',
      openedAt: nowIso,
      closedBy: null,
      closedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.deps.repository.save(day);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.BUSINESS_DAY_OPENED,
        aggregateType: 'BusinessDay',
        aggregateId: day.id,
        stationId: day.stationId,
        businessDayId: day.id,
        payload: { businessDayId: day.id, businessDate: day.businessDate },
      }),
    ]);
    return ok(day);
  }
}

/** Close the operating/accounting day for a station. */
export class CloseBusinessDay implements UseCase<CloseBusinessDayCommand, BusinessDay> {
  constructor(private readonly deps: BusinessDayDeps) {}
  async execute(input: CloseBusinessDayCommand, ctx: ExecutionContext): Promise<Result<BusinessDay>> {
    if (!input?.businessDayId) return err(validationError('businessDayId is required'));
    const existing = await this.deps.repository.findById(input.businessDayId);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('BusinessDay', input.businessDayId));
    if (existing.status === 'CLOSED') {
      return err(invariantViolation('Business day is already closed', { businessDayId: existing.id }));
    }
    const nowIso = ctx.clock.now().toISOString();
    const closed: BusinessDay = {
      ...existing,
      status: 'CLOSED',
      closedBy: ctx.actorId ?? 'system',
      closedAt: nowIso,
      updatedAt: nowIso,
    };
    await this.deps.repository.save(closed);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.BUSINESS_DAY_CLOSED,
        aggregateType: 'BusinessDay',
        aggregateId: closed.id,
        stationId: closed.stationId,
        businessDayId: closed.id,
        payload: { businessDayId: closed.id, businessDate: closed.businessDate },
      }),
    ]);
    return ok(closed);
  }
}
