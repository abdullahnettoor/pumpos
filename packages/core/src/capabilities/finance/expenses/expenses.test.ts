import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordExpense } from './index.js';
import type { Expense, ExpenseRepository } from './index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type { BusinessDay, BusinessDayRepository } from '../../station-ops/business-days/index.js';

class ExpenseRepo implements ExpenseRepository {
  readonly rows: Expense[] = [];
  async save(e: Expense) { this.rows.push(e); }
}
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('e') };
}
function shift(status: Shift['status'] = 'OPEN'): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status, openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordExpense', () => {
  it('drawer expense (SHIFT_CASH) attaches to shift + affects drawer', async () => {
    const expenses = new ExpenseRepo();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const result = await new RecordExpense({ expenses, shifts: new ShiftRepo([shift()]), businessDays: new BdRepo([]), events })
      .execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 350 }, ctx());
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
    const result = await new RecordExpense({ expenses, shifts: new ShiftRepo([]), businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ stationId: 'st-1', categoryId: 'cat-1', amount: 12000, paidFrom: 'BANK' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-1');
    }
  });

  it('rejects an expense on a locked shift', async () => {
    const result = await new RecordExpense({ expenses: new ExpenseRepo(), shifts: new ShiftRepo([shift('LOCKED')]), businessDays: new BdRepo([]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 100 }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });
});
