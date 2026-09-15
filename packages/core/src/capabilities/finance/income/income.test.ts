import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordIncome, VoidIncome, computeIncomeTax } from './index.js';
import type {
  OtherIncome,
  IncomeRepository,
  IncomeCategory,
  IncomeCategoryRepository,
} from './index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type {
  BusinessDay,
  BusinessDayWriteRepository,
} from '../../station-ops/business-days/index.js';

class IncomeRepo implements IncomeRepository {
  readonly rows: OtherIncome[] = [];
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(i: OtherIncome) {
    const idx = this.rows.findIndex((r) => r.id === i.id);
    if (idx >= 0) this.rows[idx] = i;
    else this.rows.push(i);
  }
}
class CategoryRepo implements IncomeCategoryRepository {
  constructor(readonly rows: IncomeCategory[]) {}
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
  async findOpenByStation() {
    return null;
  }
  async findByStationAndDate(orgId: string, stationId: string) {
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
    ids: new SequentialIdGenerator('inc'),
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

describe('RecordIncome', () => {
  it('cash income (SHIFT_CASH) attaches to shift + affects drawer', async () => {
    const income = new IncomeRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500, payer: 'Truck ABC' }, ctx());
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
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', categoryId: 'cat-1', amount: 25000, receivedInto: 'BANK' },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-1');
    }
  });

  it('preserves explicit non-drawer handling for a petty-cash account', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        shiftId: 'sh-1',
        categoryId: 'cat-1',
        amount: 500,
        receivedInto: 'SHIFT_CASH',
        affectsDrawer: false,
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.affectsDrawer).toBe(false);
  });

  it('rejects drawer income against a closed shift', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([shift('CLOSED')]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500 }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(income.rows).toHaveLength(0);
  });

  it('retains a closed shift on non-drawer income after day close', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([shift('CLOSED')]),
      businessDays: new BdRepo([{ ...bday(), status: 'CLOSED', closedAt: '2026-03-15T09:00:00Z' }]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500, receivedInto: 'BANK' }, ctx());
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({
        shiftId: 'sh-1',
        affectsDrawer: false,
        metadata: { lateEntry: true },
      });
  });

  it('voids an income entry', async () => {
    const income = new IncomeRepo();
    const rec = await new RecordIncome({
      income,
      shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500 }, ctx());
    const id = rec.success ? rec.data.id : '';
    const store = new InMemoryEventStore();
    const result = await new VoidIncome({
      income,
      events: new InProcessEventDispatcher({ store }),
    }).execute({ id, reason: 'duplicate' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('VOIDED');
    expect(store.events[0].eventType).toBe(BusinessEvents.INCOME_VOIDED);
  });
});

describe('VoidIncome drawer guard', () => {
  it('refuses to void drawer cash income once its shift is closed', async () => {
    const income = new IncomeRepo();
    const shifts = new ShiftRepo([shift()]);
    const rec = await new RecordIncome({
      income,
      shifts,
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', categoryId: 'cat-1', amount: 500 }, ctx());
    const id = rec.success ? rec.data.id : '';
    shifts.rows[0] = shift('CLOSED');
    const result = await new VoidIncome({
      income,
      shifts,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ id }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });
});

const category = (taxConfig: Record<string, unknown> | null): IncomeCategory => ({
  id: 'cat-1',
  organizationId: 'org-1',
  name: 'Tanker Rental',
  taxConfig,
  isSystem: false,
  isActive: true,
});

describe('computeIncomeTax (FI4)', () => {
  it('extracts GST from a tax-inclusive amount, split CGST+SGST intra-state', () => {
    const t = computeIncomeTax(11800, category({ gst_rate: 18, hsn_code: '996601' }), {
      supplierStateCode: '32',
      buyerStateCode: '32',
    });
    expect(t.taxCategory).toBe('GST');
    expect(Number(t.taxableAmount)).toBe(10000);
    expect(Number(t.cgst)).toBe(900);
    expect(Number(t.sgst)).toBe(900);
    expect(Number(t.igst)).toBe(0);
    expect(t.hsnCode).toBe('996601');
    expect(t.gstRate).toBe('18');
  });

  it('uses IGST when the payer is in another state', () => {
    const t = computeIncomeTax(11800, category({ gst_rate: 18 }), {
      supplierStateCode: '32',
      buyerStateCode: '29',
    });
    expect(Number(t.igst)).toBe(1800);
    expect(Number(t.cgst)).toBe(0);
    expect(t.snapshot?.buyer_state).toBe('29');
  });

  it('adds GST on top when the category is priced tax-exclusive', () => {
    const t = computeIncomeTax(10000, category({ gst_rate: 18, price_inclusive: false }), {
      supplierStateCode: '32',
    });
    expect(Number(t.taxableAmount)).toBe(10000);
    expect(Number(t.cgst) + Number(t.sgst)).toBe(1800);
  });

  it('treats a category with no rate as NON_TAXABLE with a zero split', () => {
    const t = computeIncomeTax(500, category(null));
    expect(t.taxCategory).toBe('NON_TAXABLE');
    expect(Number(t.taxableAmount)).toBe(500);
    expect(Number(t.cgst)).toBe(0);
    expect(t.snapshot).toBeNull();
  });

  it('honours an EXEMPT category', () => {
    const t = computeIncomeTax(500, category({ tax_category: 'EXEMPT' }));
    expect(t.taxCategory).toBe('EXEMPT');
  });
});

describe('RecordIncome tax capture', () => {
  it('freezes the GST split on the entry', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      incomeCategories: new CategoryRepo([category({ gst_rate: 18 })]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        stationId: 'st-1',
        categoryId: 'cat-1',
        amount: 11800,
        receivedInto: 'BANK',
        supplierStateCode: '32',
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxCategory).toBe('GST');
      expect(Number(result.data.taxableAmount)).toBe(10000);
      expect(Number(result.data.cgst)).toBe(900);
    }
  });

  it('defaults to a zero split when no category repository is wired', async () => {
    const income = new IncomeRepo();
    const result = await new RecordIncome({
      income,
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { stationId: 'st-1', categoryId: 'cat-1', amount: 500, receivedInto: 'BANK' },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxCategory).toBe('NON_TAXABLE');
      expect(Number(result.data.taxableAmount)).toBe(500);
    }
  });
});
