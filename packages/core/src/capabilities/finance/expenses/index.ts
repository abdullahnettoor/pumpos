import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { ShiftRepository } from '../../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';

export type PaidFrom = 'SHIFT_CASH' | 'BANK' | 'OWNER';

export interface Expense {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  categoryId: string;
  amount: string;
  paidFrom: PaidFrom;
  affectsDrawer: boolean;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRepository {
  save(expense: Expense): Promise<void>;
}

export interface RecordExpenseCommand {
  /** Drawer expenses require shiftId; business expenses may pass stationId instead. */
  shiftId?: string;
  stationId?: string;
  categoryId: string;
  amount: number | string;
  description?: string;
  paidFrom?: PaidFrom;
  affectsDrawer?: boolean;
  transactionDate?: string;
}

const schema = z.object({
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  categoryId: z.string().min(1, 'categoryId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  description: z.string().max(255).optional(),
  paidFrom: z.enum(['SHIFT_CASH', 'BANK', 'OWNER']).optional(),
  affectsDrawer: z.boolean().optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordExpenseDeps {
  expenses: ExpenseRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Record an expense anchored to a business day. Drawer expenses (paidFrom
 * SHIFT_CASH) attach to the open shift and reduce its drawer; business expenses
 * (BANK/OWNER) attach only to the business day and do not affect reconciliation.
 */
export class RecordExpense implements UseCase<RecordExpenseCommand, Expense> {
  constructor(private readonly deps: RecordExpenseDeps) {}

  async execute(input: RecordExpenseCommand, ctx: ExecutionContext): Promise<Result<Expense>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordExpense command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const paidFrom: PaidFrom = cmd.paidFrom ?? 'SHIFT_CASH';
    let affectsDrawer = cmd.affectsDrawer ?? paidFrom === 'SHIFT_CASH';

    let businessDayId: string;
    let shiftId: string | null;

    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      shiftId = affectsDrawer ? shift.id : null;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? ctx.clock.now().toISOString().slice(0, 10);
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);
      businessDayId = bd.id;
      shiftId = null;
      affectsDrawer = false;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const expense: Expense = {
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      categoryId: cmd.categoryId,
      amount: String(cmd.amount),
      paidFrom,
      affectsDrawer,
      description: cmd.description ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.expenses.save(expense);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.EXPENSE_RECORDED,
        aggregateType: 'Expense',
        aggregateId: expense.id,
        businessDayId,
        payload: { expenseId: expense.id, amount: expense.amount, paidFrom, affectsDrawer, shiftId },
      }),
    ]);

    return ok(expense);
  }
}
