import { describe, expect, it } from 'vitest';
import { BusinessEvents } from '../../../kernel/index.js';
import { RecordExpense, VoidExpense } from './index.js';
import type { Expense, ExpenseRepository } from './index.js';
import { AccountRepo, eventBus, officeCtx } from '../__fixtures__/office.js';

class ExpenseRepo implements ExpenseRepository {
  readonly rows: Expense[] = [];
  async save(e: Expense) {
    const i = this.rows.findIndex((r) => r.id === e.id);
    if (i >= 0) this.rows[i] = e;
    else this.rows.push(e);
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
}

function record(expenses: ExpenseRepo, input: Record<string, unknown>) {
  const { store, events } = eventBus();
  const result = new RecordExpense({ expenses, accounts: new AccountRepo(), events }).execute(
    { categoryId: 'cat', amount: 250, fundingAccountId: 'petty', ...input } as any,
    officeCtx(),
  );
  return { result, store };
}

describe('RecordExpense (Office Record, ADR 0005)', () => {
  it('records on the Entry Date against the Funding Account, with no shift or business day', async () => {
    const expenses = new ExpenseRepo();
    const { result, store } = record(expenses, {});
    const r = await result;
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      organizationId: 'org-1',
      stationId: 'st-1',
      entryDate: '2026-03-15',
      fundingAccountId: 'petty',
      amount: '250',
    });
    expect(r.data).not.toHaveProperty('shiftId');
    expect(r.data).not.toHaveProperty('businessDayId');

    const [event] = store.events;
    expect(event.eventType).toBe(BusinessEvents.EXPENSE_RECORDED);
    expect(event.businessDayId).toBeNull();
    expect(event.payload).toEqual({
      expenseId: r.data.id,
      amount: '250',
      entryDate: '2026-03-15',
      fundingAccountId: 'petty',
    });
    expect((event.metadata as any).presentation).toEqual({
      templateId: 'expense.v2',
      values: { amount: 250, accountName: 'Petty Cash' },
    });
  });

  it('keeps a back-dated Entry Date', async () => {
    const r = await record(new ExpenseRepo(), { entryDate: '2026-03-01' }).result;
    expect(r.success && r.data.entryDate).toBe('2026-03-01');
  });

  it('rejects a future Entry Date', async () => {
    const r = await record(new ExpenseRepo(), { entryDate: '2026-03-16' }).result;
    expect(r.success).toBe(false);
  });

  it('requires a Funding Account', async () => {
    const r = await record(new ExpenseRepo(), { fundingAccountId: undefined }).result;
    expect(r.success).toBe(false);
  });
});

describe('VoidExpense', () => {
  it('voids an entry, keeps it (soft) and emits EXPENSE_VOIDED', async () => {
    const expenses = new ExpenseRepo();
    const recorded = await record(expenses, {}).result;
    if (!recorded.success) throw new Error('setup');
    const { store, events } = eventBus();
    const r = await new VoidExpense({ expenses, events }).execute(
      { id: recorded.data.id, reason: 'typo' },
      officeCtx(),
    );
    expect(r.success && r.data.status).toBe('VOIDED');
    expect(expenses.rows).toHaveLength(1);
    expect(store.events[0].eventType).toBe(BusinessEvents.EXPENSE_VOIDED);
    expect(store.events[0].payload).toMatchObject({ entryDate: '2026-03-15', reason: 'typo' });
  });

  it('refuses to void twice', async () => {
    const expenses = new ExpenseRepo();
    const recorded = await record(expenses, {}).result;
    if (!recorded.success) throw new Error('setup');
    const { events } = eventBus();
    const uc = new VoidExpense({ expenses, events });
    await uc.execute({ id: recorded.data.id }, officeCtx());
    const again = await uc.execute({ id: recorded.data.id }, officeCtx());
    expect(again.success).toBe(false);
  });
});
