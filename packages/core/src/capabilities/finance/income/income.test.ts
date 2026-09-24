import { describe, expect, it } from 'vitest';
import { BusinessEvents } from '../../../kernel/index.js';
import { RecordIncome, VoidIncome, computeIncomeTax } from './index.js';
import type {
  OtherIncome,
  IncomeRepository,
  IncomeCategory,
  IncomeCategoryRepository,
} from './index.js';
import {
  AccountRepo,
  eventBus,
  officeCtx,
  terminal,
  TerminalLookup,
} from '../__fixtures__/office.js';

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
function ctx() {
  return officeCtx();
}

describe('RecordIncome (Office Record, ADR 0005)', () => {
  it('records on the Entry Date into the Funding Account, with no shift or business day', async () => {
    const income = new IncomeRepo();
    const { store, events } = eventBus();
    const r = await new RecordIncome({ income, accounts: new AccountRepo(), events }).execute(
      { categoryId: 'cat-1', amount: 1500, fundingAccountId: 'hdfc', payer: 'Tanker Co' },
      ctx(),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      stationId: 'st-1',
      entryDate: '2026-03-15',
      fundingAccountId: 'hdfc',
      terminalId: null,
    });
    const [event] = store.events;
    expect(event.eventType).toBe(BusinessEvents.INCOME_RECORDED);
    expect(event.businessDayId).toBeNull();
    expect(event.payload).toMatchObject({ entryDate: '2026-03-15', fundingAccountId: 'hdfc' });
    expect(event.payload).not.toHaveProperty('shiftId');
  });

  it('routes a terminal receipt to its clearing account (#276)', async () => {
    const income = new IncomeRepo();
    const { events } = eventBus();
    const r = await new RecordIncome({
      income,
      accounts: new AccountRepo(),
      terminals: new TerminalLookup([terminal('pos-1')]),
      events,
    }).execute({ categoryId: 'cat-1', amount: 800, terminalId: 'pos-1' }, ctx());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fundingAccountId).toBe('clearing');
      expect(r.data.terminalId).toBe('pos-1');
    }
  });

  it('voids an income entry', async () => {
    const income = new IncomeRepo();
    const { events } = eventBus();
    const recorded = await new RecordIncome({
      income,
      accounts: new AccountRepo(),
      events,
    }).execute({ categoryId: 'cat-1', amount: 100, fundingAccountId: 'cash' }, ctx());
    if (!recorded.success) throw new Error('setup');
    const bus = eventBus();
    const r = await new VoidIncome({ income, events: bus.events }).execute(
      { id: recorded.data.id },
      ctx(),
    );
    expect(r.success && r.data.status).toBe('VOIDED');
    expect(bus.store.events[0].eventType).toBe(BusinessEvents.INCOME_VOIDED);
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
      accounts: new AccountRepo(),
      incomeCategories: new CategoryRepo([category({ gst_rate: 18 })]),
      events: eventBus().events,
    }).execute(
      {
        stationId: 'st-1',
        categoryId: 'cat-1',
        amount: 11800,
        fundingAccountId: 'hdfc',
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
      accounts: new AccountRepo(),
      events: eventBus().events,
    }).execute(
      { stationId: 'st-1', categoryId: 'cat-1', amount: 500, fundingAccountId: 'hdfc' },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxCategory).toBe('NON_TAXABLE');
      expect(Number(result.data.taxableAmount)).toBe(500);
    }
  });
});
