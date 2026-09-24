import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { FinancialAccountRepository } from '../accounts/index.js';
import { resolveOfficeEntry } from '../office-entry.js';

/**
 * An expense is an Office Record (ADR 0005): dated by its Entry Date and paid
 * out of a Funding Account. It never touches a Shift, a Business Day or the
 * Drawer.
 */
export interface Expense {
  id: string;
  organizationId: string;
  stationId: string;
  entryDate: string;
  fundingAccountId: string;
  categoryId: string;
  amount: string;
  description: string | null;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRepository {
  save(expense: Expense): Promise<void>;
  findById(id: string): Promise<Expense | null>;
}

export interface RecordExpenseCommand {
  stationId?: string;
  entryDate?: string;
  fundingAccountId: string;
  categoryId: string;
  amount: number | string;
  description?: string;
}

const schema = z.object({
  stationId: z.string().min(1).optional(),
  entryDate: z.string().optional(),
  fundingAccountId: z.string().min(1, 'fundingAccountId is required'),
  categoryId: z.string().min(1, 'categoryId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  description: z.string().max(255).optional(),
});

export interface RecordExpenseDeps {
  expenses: ExpenseRepository;
  accounts: FinancialAccountRepository;
  events: EventPublisher;
}

/** Record an expense on its Entry Date, paid from the chosen Funding Account. */
export class RecordExpense implements UseCase<RecordExpenseCommand, Expense> {
  constructor(private readonly deps: RecordExpenseDeps) {}

  async execute(input: RecordExpenseCommand, ctx: ExecutionContext): Promise<Result<Expense>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid RecordExpense command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const entry = await resolveOfficeEntry(this.deps, ctx, cmd);
    if (!entry.success) return entry;
    const { stationId, entryDate, fundingAccount } = entry.data;

    const now = ctx.clock.now().toISOString();
    const expense: Expense = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId,
      entryDate,
      fundingAccountId: fundingAccount.id,
      categoryId: cmd.categoryId,
      amount: String(cmd.amount),
      description: cmd.description ?? null,
      status: 'ACTIVE',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.expenses.save(expense);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.EXPENSE_RECORDED,
        aggregateType: 'Expense',
        aggregateId: expense.id,
        stationId,
        businessDayId: null,
        payload: {
          expenseId: expense.id,
          amount: expense.amount,
          entryDate,
          fundingAccountId: fundingAccount.id,
        },
        presentation: {
          templateId: 'expense.v2',
          values: { amount: Number(expense.amount), accountName: fundingAccount.name },
        },
      }),
    ]);

    return ok(expense);
  }
}

export interface VoidExpenseCommand {
  id: string;
  reason?: string;
}

const voidSchema = z.object({
  id: z.string().min(1, 'id is required'),
  reason: z.string().max(255).optional(),
});

export interface VoidExpenseDeps {
  expenses: ExpenseRepository;
  events: EventPublisher;
}

/** Void an expense (soft) — reverses its ledger posting via the outbox. */
export class VoidExpense implements UseCase<VoidExpenseCommand, Expense> {
  constructor(private readonly deps: VoidExpenseDeps) {}

  async execute(input: VoidExpenseCommand, ctx: ExecutionContext): Promise<Result<Expense>> {
    const p = voidSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid VoidExpense command', { issues: p.error.flatten() }));

    const existing = await this.deps.expenses.findById(p.data.id);
    if (!existing) return err(notFoundError('Expense', p.data.id));
    if (existing.status === 'VOIDED')
      return err(invariantViolation('Expense already voided', { id: existing.id }));

    const now = ctx.clock.now().toISOString();
    const voided: Expense = { ...existing, status: 'VOIDED', updatedAt: now };
    await this.deps.expenses.save(voided);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.EXPENSE_VOIDED,
        aggregateType: 'Expense',
        aggregateId: voided.id,
        stationId: voided.stationId,
        businessDayId: null,
        payload: {
          expenseId: voided.id,
          amount: voided.amount,
          entryDate: voided.entryDate,
          fundingAccountId: voided.fundingAccountId,
          reason: p.data.reason ?? null,
        },
      }),
    ]);

    return ok(voided);
  }
}
