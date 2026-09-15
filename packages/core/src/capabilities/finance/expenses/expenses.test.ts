import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordExpense, VoidExpense } from './index.js';
import type { Expense, ExpenseRepository } from './index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type {
  BusinessDay,
  BusinessDayWriteRepository,
} from '../../station-ops/business-days/index.js';

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
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findByIdWithoutLock(id: string) {
    return this.findById(id);
  }
  async save() {}
  async findOpenByStation() {
    return null;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayWriteRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN',
      ) ?? null
    );
  }
  async findByStationAndDate(orgId: string, stationId: string, _date: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

function ctx(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('e'),
  };
}
function shift(status: Shift['status'] = 'OPEN'): Shift {
  return {
    id: 'sh-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd-1',
    shiftTemplateId: 't',
    status,
    openedBy: 'u',
    openedAt: '',
    closedBy: null,
    closedAt: null,
    lockedAt: null,
    openingCash: '0',
    closingCash: null,
    createdAt: '',
    updatedAt: '',
  };
}
function bday(): BusinessDay {
  return {
    id: 'bd-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDate: '2026-03-15',
    status: 'OPEN',
    openedBy: 'u',
    openedAt: '',
    closedBy: null,
    closedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('RecordExpense', () => {
  it('drawer expense (SHIFT_CASH) attaches to shift + affects drawer', async () => {
    const expenses = new ExpenseRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const result = await new RecordExpense({
      expenses,
      shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]),
      events,
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 350 }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('sh-1');
      expect(result.data.affectsDrawer).toBe(true);
      expect(result.data.businessDayId).toBe('bd-1');
    }
    expect(store.events[0].eventType).toBe(BusinessEvents.EXPENSE_RECORDED);
  });

  it('business expense (BANK via stationId) does not affect drawer and has no shift', async () => {
    const expenses = new ExpenseRepo();
    const result = await new RecordExpense({
      expenses,
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ stationId: 'st-1', categoryId: 'cat-1', amount: 12000, paidFrom: 'BANK' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-1');
    }
  });

  it('preserves explicit non-drawer handling for a petty-cash account', async () => {
    const expenses = new ExpenseRepo();
    const result = await new RecordExpense({
      expenses,
      shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        shiftId: 'sh-1',
        categoryId: 'cat-1',
        amount: 100,
        paidFrom: 'SHIFT_CASH',
        affectsDrawer: false,
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.affectsDrawer).toBe(false);
  });

  it('rejects a drawer expense against a locked shift', async () => {
    const expenses = new ExpenseRepo();
    const result = await new RecordExpense({
      expenses,
      shifts: new ShiftRepo([shift('LOCKED')]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 100 }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(expenses.rows).toHaveLength(0);
  });

  it('retains a closed shift on a non-drawer late expense', async () => {
    const expenses = new ExpenseRepo();
    const closedDay = { ...bday(), status: 'CLOSED' as const, closedAt: '2026-03-15T09:00:00Z' };
    const result = await new RecordExpense({
      expenses,
      shifts: new ShiftRepo([shift('CLOSED')]),
      businessDays: new BdRepo([closedDay]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 100, paidFrom: 'BANK' }, ctx());
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        shiftId: 'sh-1',
        affectsDrawer: false,
        metadata: { lateEntry: true },
      });
  });
});

describe('VoidExpense', () => {
  async function seed(paidFrom: 'SHIFT_CASH' | 'BANK', shifts: ShiftRepo) {
    const expenses = new ExpenseRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const rec = await new RecordExpense({
      expenses,
      shifts,
      businessDays: new BdRepo([bday()]),
      events,
    }).execute(
      paidFrom === 'SHIFT_CASH'
        ? { shiftId: 'sh-1', categoryId: 'cat-1', amount: 350 }
        : { stationId: 'st-1', categoryId: 'cat-1', amount: 350, paidFrom: 'BANK' },
      ctx(),
    );
    if (!rec.success) throw new Error('seed failed');
    return { expenses, store, events, id: rec.data.id };
  }

  it('voids an entry, keeps it (soft) and emits EXPENSE_VOIDED', async () => {
    const shifts = new ShiftRepo([shift()]);
    const { expenses, store, events, id } = await seed('SHIFT_CASH', shifts);
    const result = await new VoidExpense({ expenses, shifts, events }).execute(
      { id, reason: 'duplicate' },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('VOIDED');
    expect(expenses.rows).toHaveLength(1);
    expect(store.events.at(-1)?.eventType).toBe(BusinessEvents.EXPENSE_VOIDED);
  });

  it('refuses to void twice', async () => {
    const shifts = new ShiftRepo([shift()]);
    const { expenses, events, id } = await seed('SHIFT_CASH', shifts);
    await new VoidExpense({ expenses, shifts, events }).execute({ id }, ctx());
    const again = await new VoidExpense({ expenses, shifts, events }).execute({ id }, ctx());
    expect(again.success).toBe(false);
    if (!again.success) expect(again.error.code).toBe('INVARIANT_VIOLATION');
  });

  it('refuses to void a drawer expense once its shift is closed', async () => {
    const shifts = new ShiftRepo([shift()]);
    const { expenses, events, id } = await seed('SHIFT_CASH', shifts);
    shifts.rows[0] = shift('CLOSED');
    const result = await new VoidExpense({ expenses, shifts, events }).execute({ id }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });

  it('allows voiding a business (bank) expense regardless of shift state', async () => {
    const shifts = new ShiftRepo([shift('CLOSED')]);
    const { expenses, events, id } = await seed('BANK', shifts);
    const result = await new VoidExpense({ expenses, shifts, events }).execute({ id }, ctx());
    expect(result.success).toBe(true);
  });
});
