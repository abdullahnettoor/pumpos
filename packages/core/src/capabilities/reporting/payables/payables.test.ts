import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { composePayables, composeSupplierPayable } from './compose.js';
import { GetPayables, GetSupplierPayable } from './get-payables.js';
import type {
  PayablesQuery,
  PayablesReader,
  PayablesSource,
  SupplierPayableQuery,
  SupplierPayableSource,
} from './ports.js';

const ctxAt = (iso: string, over: Partial<ExecutionContext> = {}): ExecutionContext => ({
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: null,
  actorId: 'user-1',
  correlationId: null,
  timeZone: 'Asia/Kolkata',
  businessDayStartsAt: '06:00',
  clock: new FixedClock(new Date(iso)),
  ids: new SequentialIdGenerator(),
  ...over,
});
// 15:30 IST on 2026-10-09.
const ctx = ctxAt('2026-10-09T10:00:00Z');
const OCTOBER = { purchasedMonth: '2026-10', paidMonth: '2026-10' };

const supplierSource = (over: Partial<SupplierPayableSource> = {}): SupplierPayableSource => ({
  payable: { supplierId: 's-1', balance: 1043200, unpaidCount: 1, oldestUnpaidDate: '2026-10-09' },
  lastPayment: {
    amount: 980000,
    entryDate: '2026-10-06',
    method: 'BANK',
    fundingAccountName: 'SBI current a/c',
  },
  month: { purchased: 2072200, paid: 980000, purchaseCount: 2, quantity: 22000 },
  purchasesByProduct: [
    { productId: 'p-1', name: 'HSD', unit: 'L', quantity: 12000, value: 1043200 },
    { productId: 'p-2', name: 'MS', unit: 'L', quantity: 10000, value: 1029000 },
  ],
  ...over,
});

class Reader implements PayablesReader {
  summaryQuery: PayablesQuery | null = null;
  supplierQuery: SupplierPayableQuery | null = null;
  constructor(
    private readonly summarySource: PayablesSource = {
      total: 0,
      supplierCount: 0,
      month: { purchased: 0, paid: 0 },
      suppliers: [],
    },
    private readonly supplierResult: SupplierPayableSource | null = supplierSource(),
  ) {}
  async summary(query: PayablesQuery) {
    this.summaryQuery = query;
    return this.summarySource;
  }
  async supplier(query: SupplierPayableQuery) {
    this.supplierQuery = query;
    return this.supplierResult;
  }
}

describe('composePayables', () => {
  it('ages the oldest unpaid Purchase from the Current Business Date and keeps the totals', () => {
    const out = composePayables(
      {
        total: 1085800.006,
        supplierCount: 3,
        month: { purchased: 2140000.004, paid: 1020000 },
        suppliers: [
          { supplierId: 'a', balance: 1043200, unpaidCount: 1, oldestUnpaidDate: '2026-10-09' },
          { supplierId: 'b', balance: 38400, unpaidCount: 2, oldestUnpaidDate: '2026-09-29' },
        ],
      },
      '2026-10-09',
      OCTOBER,
    );
    expect(out.total).toBe(1085800.01);
    expect(out.supplierCount).toBe(3);
    expect(out.month).toEqual({ purchased: 2140000, paid: 1020000, ...OCTOBER });
    expect(out.suppliers.map((s) => s.oldestUnpaidDays)).toEqual([0, 10]);
    expect(out.suppliers[1]).toMatchObject({ unpaidCount: 2, oldestUnpaidDate: '2026-09-29' });
  });

  it('keeps the total over everyone while the rows are capped by the reader', () => {
    const out = composePayables(
      { total: 5000, supplierCount: 900, month: { purchased: 0, paid: 0 }, suppliers: [] },
      '2026-10-09',
      OCTOBER,
    );
    expect(out).toMatchObject({ total: 5000, supplierCount: 900, suppliers: [] });
  });

  it('shows no age for a supplier with nothing unpaid, and never ages below zero days', () => {
    const out = composePayables(
      {
        total: 10,
        supplierCount: 2,
        month: { purchased: 0, paid: 0 },
        suppliers: [
          { supplierId: 'a', balance: 10, unpaidCount: 0, oldestUnpaidDate: null },
          { supplierId: 'b', balance: 10, unpaidCount: 1, oldestUnpaidDate: '2026-10-12' },
        ],
      },
      '2026-10-09',
      OCTOBER,
    );
    expect(out.suppliers[0]).toMatchObject({ oldestUnpaidDate: null, oldestUnpaidDays: null });
    expect(out.suppliers[1].oldestUnpaidDays).toBe(0);
  });
});

describe('composeSupplierPayable', () => {
  it('rounds the month figures, passes the last payment and the products through', () => {
    const out = composeSupplierPayable(
      supplierSource({
        month: { purchased: 100.004, paid: 50.006, purchaseCount: 2, quantity: 12.3456 },
        purchasesByProduct: [
          { productId: 'p-1', name: 'HSD', unit: 'L', quantity: 12.3456, value: 99.999 },
        ],
      }),
      '2026-10-09',
      OCTOBER,
    );
    expect(out.month).toEqual({
      purchased: 100,
      paid: 50.01,
      ...OCTOBER,
      purchaseCount: 2,
      quantity: 12.35,
    });
    expect(out.purchasesByProduct).toEqual([
      { productId: 'p-1', name: 'HSD', unit: 'L', quantity: 12.35, value: 100 },
    ]);
    expect(out.lastPayment).toEqual({
      amount: 980000,
      entryDate: '2026-10-06',
      method: 'BANK',
      fundingAccountName: 'SBI current a/c',
    });
    expect(out.oldestUnpaidDays).toBe(0);
  });

  it('keeps a negative balance (an advance) as it is', () => {
    const out = composeSupplierPayable(
      supplierSource({
        payable: { supplierId: 's-1', balance: -49000, unpaidCount: 0, oldestUnpaidDate: null },
      }),
      '2026-10-09',
      OCTOBER,
    );
    expect(out).toMatchObject({ balance: -49000, unpaidCount: 0, oldestUnpaidDate: null });
    expect(out.oldestUnpaidDays).toBeNull();
  });

  it('hides, rather than zeroes, a supplier never paid', () => {
    const out = composeSupplierPayable(
      supplierSource({ lastPayment: null, purchasesByProduct: [] }),
      '2026-10-09',
      OCTOBER,
    );
    expect(out.lastPayment).toBeNull();
    expect(out.purchasesByProduct).toEqual([]);
  });
});

describe('GetPayables', () => {
  it('measures "this month" per anchor: Purchases by Business Date, Payments by Entry Date', async () => {
    const reader = new Reader();
    // 03:00 IST on 1 Nov: the Business Date is still 31 Oct (before 06:00), the Entry Date is 1 Nov.
    const res = await new GetPayables(reader).execute(
      { stationId: 'station-1' },
      ctxAt('2026-10-31T21:30:00Z'),
    );
    expect(res.success).toBe(true);
    expect(reader.summaryQuery).toEqual({
      organizationId: 'org-1',
      purchasedFrom: '2026-10-01',
      purchasedTo: '2026-10-31',
      paidFrom: '2026-11-01',
      paidTo: '2026-11-30',
    });
    // The wire says which month each figure covers, so the screen can say so when they differ.
    expect(res.success && res.data.month).toMatchObject({
      purchasedMonth: '2026-10',
      paidMonth: '2026-11',
    });
  });

  it('refuses a missing station', async () => {
    const res = await new GetPayables(new Reader()).execute({ stationId: '' }, ctx);
    expect(res.success).toBe(false);
  });
});

describe('GetSupplierPayable', () => {
  it('reads under the caller organization with the supplier and the month windows', async () => {
    const reader = new Reader();
    const res = await new GetSupplierPayable(reader).execute(
      { stationId: 'station-1', supplierId: 's-1' },
      ctx,
    );
    expect(res.success).toBe(true);
    expect(reader.supplierQuery).toEqual({
      organizationId: 'org-1',
      supplierId: 's-1',
      purchasedFrom: '2026-10-01',
      purchasedTo: '2026-10-31',
      paidFrom: '2026-10-01',
      paidTo: '2026-10-31',
    });
  });

  it('ages the oldest unpaid Purchase against the Business Date in the midnight to Day Start window', async () => {
    // 03:00 IST on 10 Oct: the Business Date is still the 9th.
    const res = await new GetSupplierPayable(
      new Reader(
        undefined,
        supplierSource({
          payable: {
            supplierId: 's-1',
            balance: 5,
            unpaidCount: 1,
            oldestUnpaidDate: '2026-10-01',
          },
        }),
      ),
    ).execute({ stationId: 'station-1', supplierId: 's-1' }, ctxAt('2026-10-09T21:30:00Z'));
    expect(res.success && res.data.oldestUnpaidDays).toBe(8);
  });

  it('answers not found when the supplier is not in the organization', async () => {
    const res = await new GetSupplierPayable(new Reader(undefined, null)).execute(
      { stationId: 'station-1', supplierId: 's-9' },
      ctx,
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('refuses a missing supplier id', async () => {
    const res = await new GetSupplierPayable(new Reader()).execute(
      { stationId: 'station-1', supplierId: '' },
      ctx,
    );
    expect(res.success).toBe(false);
  });
});
