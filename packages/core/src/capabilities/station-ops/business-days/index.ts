import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
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
  findByStationAndDate(organizationId: string, stationId: string, businessDate: string): Promise<BusinessDay | null>;
}

/**
 * Resolve the business day a non-shift money movement belongs to, by its
 * transaction date — creating the day lazily if it does not exist yet. This
 * removes the "open a business day first" ceremony: any date is transactional
 * (settlements/collections can land on Sundays/holidays). A day created for a
 * past date is recorded as CLOSED (a historical bucket, invisible to the
 * single-open-day shift logic); today/future is OPEN. The business day's date
 * IS the transaction date, so no separate column is needed.
 */
export async function ensureBusinessDayForDate(
  repo: BusinessDayRepository,
  ctx: ExecutionContext,
  stationId: string,
  businessDate: string,
): Promise<BusinessDay> {
  const existing = await repo.findByStationAndDate(ctx.organizationId, stationId, businessDate);
  if (existing) return existing;
  const today = resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
  const isPast = businessDate < today;
  const nowIso = ctx.clock.now().toISOString();
  const day: BusinessDay = {
    id: ctx.ids.newId(),
    organizationId: ctx.organizationId,
    stationId,
    businessDate,
    status: isPast ? 'CLOSED' : 'OPEN',
    openedBy: ctx.actorId ?? 'system',
    openedAt: nowIso,
    closedBy: isPast ? (ctx.actorId ?? 'system') : null,
    closedAt: isPast ? nowIso : null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await repo.save(day);
  return day;
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

    const now = ctx.clock.now();
    const businessDate = p.data.businessDate ?? resolveBusinessDate({ now, timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    // One business day per (station, date). Several dates may be open at once;
    // a past day stays open until explicitly closed (close day 1 on day 5).
    const existing = await this.deps.repository.findByStationAndDate(ctx.organizationId, p.data.stationId, businessDate);
    if (existing) {
      return err(conflictError('A business day already exists for this station and date', { businessDayId: existing.id, businessDate: existing.businessDate }));
    }

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
