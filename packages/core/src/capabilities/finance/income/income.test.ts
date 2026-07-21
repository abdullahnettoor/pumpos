import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordIncome, VoidIncome } from './index.js';
import type { OtherIncome, IncomeRepository } from './index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type { BusinessDay, BusinessDayRepository } from '../../station-ops/business-days/index.js';

class IncomeRepo implements IncomeRepository {
  readonly rows: OtherIncome[] = [];
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save(i: OtherIncome) {
    const idx = this.rows.findIndex((r) => r.id === i.id);
    if (idx >= 0) this.rows[idx] = i; else this.rows.push(i);
  }
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
  async findOpenByStation() { return null; }
  async findByStationAndDate(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('inc') };
}
function shift(status: Shift['status'] = 'OPEN'): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status, openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordIncome', () => {
  it('cash income (SHIFT_CASH) attaches to shift + affects drawer', async () => {
    const income = new IncomeRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordIncome({ income, shifts: new ShiftRepo([shift()]), businessDays: new BdRepo([]), events: new InProcessEventDispatcher({ store }) })
      .execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500, payer: 'Truck ABC' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('sh-1');
      expect(result.data.affectsDrawer).toBe(true);
      expect(result.data.receivedInto).toBe('SHIFT_CASH');
      expect(result.data.businessDayId).toBe('bd-1');
    }
    expect(store.events[0].eventType).toBe(BusinessEvents.INCOME_RECORDED);
  });

  it('bank income (via stationId) does not affect drawer and has no shift', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({ income, shifts: new ShiftRepo([]), businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ stationId: 'st-1', categoryId: 'cat-1', amount: 25000, receivedInto: 'BANK' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-1');
    }
  });

  it('voids an income entry', async () => {
    const income = new IncomeRepo();
    const rec = await new RecordIncome({ income, shifts: new ShiftRepo([shift()]), businessDays: new BdRepo([]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }) })
      .execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500 }, ctx());
    const id = rec.success ? rec.data.id : '';
    const store = new InMemoryEventStore();
    const result = await new VoidIncome({ income, events: new InProcessEventDispatcher({ store }) }).execute({ id, reason: 'duplicate' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('VOIDED');
    expect(store.events[0].eventType).toBe(BusinessEvents.INCOME_VOIDED);
  });
});
