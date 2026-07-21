import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { ShiftRepository } from '../../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';

/** Where the money landed. Symmetric with expense `paidFrom`. */
export type ReceivedInto = 'SHIFT_CASH' | 'BANK' | 'OWNER';

export interface IncomeCategory {
  id: string;
  organizationId: string;
  name: string;
  taxConfig: Record<string, unknown> | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface OtherIncome {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  categoryId: string;
  amount: string;
  receivedInto: ReceivedInto;
  affectsDrawer: boolean;
  payer: string | null;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeRepository {
  save(income: OtherIncome): Promise<void>;
  findById(id: string): Promise<OtherIncome | null>;
}

export interface RecordIncomeCommand {
  /** Drawer (cash) income requires shiftId; bank/owner income may pass stationId instead. */
  shiftId?: string;
  stationId?: string;
  categoryId: string;
  amount: number | string;
  receivedInto?: ReceivedInto;
  affectsDrawer?: boolean;
  payer?: string;
  description?: string;
  transactionDate?: string;
}

const schema = z.object({
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  categoryId: z.string().min(1, 'categoryId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  receivedInto: z.enum(['SHIFT_CASH', 'BANK', 'OWNER']).optional(),
  affectsDrawer: z.boolean().optional(),
  payer: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordIncomeDeps {
  income: IncomeRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Record indirect / non-operating income (tanker rental, truck parking,
 * commission, scrap, interest, …) anchored to a business day. Cash income
 * (receivedInto SHIFT_CASH) attaches to the open shift and increases its drawer;
 * bank/owner income attaches only to the business day. Mirror of RecordExpense.
 */
export class RecordIncome implements UseCase<RecordIncomeCommand, OtherIncome> {
  constructor(private readonly deps: RecordIncomeDeps) {}

  async execute(input: RecordIncomeCommand, ctx: ExecutionContext): Promise<Result<OtherIncome>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordIncome command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const receivedInto: ReceivedInto = cmd.receivedInto ?? 'SHIFT_CASH';
    let affectsDrawer = cmd.affectsDrawer ?? receivedInto === 'SHIFT_CASH';

    let businessDayId: string;
    let shiftId: string | null;

    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      shiftId = affectsDrawer ? shift.id : null;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);
      businessDayId = bd.id;
      shiftId = null;
      affectsDrawer = false;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const income: OtherIncome = {
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      categoryId: cmd.categoryId,
      amount: String(cmd.amount),
      receivedInto,
      affectsDrawer,
      payer: cmd.payer ?? null,
      referenceType: null,
      referenceId: null,
      description: cmd.description ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.income.save(income);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INCOME_RECORDED,
        aggregateType: 'Income',
        aggregateId: income.id,
        businessDayId,
        payload: { incomeId: income.id, amount: income.amount, receivedInto, affectsDrawer, shiftId, categoryId: income.categoryId },
      }),
    ]);

    return ok(income);
  }
}

export interface VoidIncomeCommand {
  id: string;
  reason?: string;
}

const voidSchema = z.object({ id: z.string().min(1, 'id is required'), reason: z.string().max(255).optional() });

export interface VoidIncomeDeps {
  income: IncomeRepository;
  events: EventPublisher;
}

/** Void an income entry (soft) — reverses its ledger posting via the outbox. */
export class VoidIncome implements UseCase<VoidIncomeCommand, OtherIncome> {
  constructor(private readonly deps: VoidIncomeDeps) {}

  async execute(input: VoidIncomeCommand, ctx: ExecutionContext): Promise<Result<OtherIncome>> {
    const p = voidSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid VoidIncome command', { issues: p.error.flatten() }));

    const existing = await this.deps.income.findById(p.data.id);
    if (!existing) return err(notFoundError('Income', p.data.id));
    if (existing.status === 'VOIDED') return err(invariantViolation('Income already voided', { id: existing.id }));

    const now = ctx.clock.now().toISOString();
    const voided: OtherIncome = { ...existing, status: 'VOIDED', updatedAt: now };
    await this.deps.income.save(voided);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INCOME_VOIDED,
        aggregateType: 'Income',
        aggregateId: voided.id,
        businessDayId: voided.businessDayId,
        payload: { incomeId: voided.id, amount: voided.amount, reason: p.data.reason ?? null },
      }),
    ]);

    return ok(voided);
  }
}
