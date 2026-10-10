import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { composeCustomerReceivable, composeReceivables, usuallyPaysInDays } from './compose.js';
import { GetCustomerReceivable, GetReceivables } from './get-receivables.js';
import type {
  CustomerReceivableQuery,
  CustomerReceivableSource,
  ReceivablesQuery,
  ReceivablesReader,
  ReceivablesSource,
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

const aging = (d0_7 = 0, d8_30 = 0, d30plus = 0) => ({ d0_7, d8_30, d30plus });

const customerSource = (
  over: Partial<CustomerReceivableSource> = {},
): CustomerReceivableSource => ({
  settlementCycle: 'OPEN',
  receivable: {
    customerId: 'c-1',
    balance: 150,
    oldestUnpaidDate: '2026-10-01',
    aging: aging(100, 50, 0),
  },
  lastPayment: { amount: 40000, entryDate: '2026-09-18', method: 'UPI' },
  settled: { count: 6, meanDays: 23.6 },
  month: { credit: 81900, slips: 23, litres: 812, paid: 0 },
  vehicles: [
    { vehicleId: 'v-1', registration: 'KL-11-AB-4521', type: 'Truck', amount: 52300, litres: 600 },
  ],
  ...over,
});

class Reader implements ReceivablesReader {
  summaryQuery: ReceivablesQuery | null = null;
  customerQuery: CustomerReceivableQuery | null = null;
  constructor(
    private readonly summarySource: ReceivablesSource = {
      aging: aging(),
      customerCount: 0,
      customers: [],
    },
    private readonly customerResult: CustomerReceivableSource | null = customerSource(),
  ) {}
  async summary(query: ReceivablesQuery) {
    this.summaryQuery = query;
    return this.summarySource;
  }
  async customer(query: CustomerReceivableQuery) {
    this.customerQuery = query;
    return this.customerResult;
  }
}

describe('composeReceivables', () => {
  it('totals the buckets and ages each customer from the Current Business Date', () => {
    const out = composeReceivables(
      {
        aging: aging(287, 211.005, 184),
        customerCount: 2,
        customers: [
          {
            customerId: 'a',
            balance: 300,
            oldestUnpaidDate: '2026-09-21',
            aging: aging(100, 0, 200),
          },
          { customerId: 'b', balance: 50, oldestUnpaidDate: '2026-10-09', aging: aging(50, 0, 0) },
        ],
      },
      '2026-10-09',
    );
    expect(out.total).toBe(682.01);
    expect(out.aging).toEqual({ d0_7: 287, d8_30: 211.01, d30plus: 184 });
    expect(out.customerCount).toBe(2);
    expect(out.customers.map((c) => c.oldestUnpaidDays)).toEqual([18, 0]);
  });

  it('keeps the total over everyone while the rows are capped by the reader', () => {
    const out = composeReceivables(
      { aging: aging(1000), customerCount: 900, customers: [] },
      '2026-10-09',
    );
    expect(out).toMatchObject({ total: 1000, customerCount: 900, customers: [] });
  });

  it('never ages a debit below zero days', () => {
    const out = composeReceivables(
      {
        aging: aging(10),
        customerCount: 1,
        customers: [
          { customerId: 'a', balance: 10, oldestUnpaidDate: '2026-10-12', aging: aging(10) },
        ],
      },
      '2026-10-09',
    );
    expect(out.customers[0].oldestUnpaidDays).toBe(0);
  });

  it('shows no age for a customer with nothing unpaid', () => {
    const out = composeReceivables(
      {
        aging: aging(),
        customerCount: 0,
        customers: [{ customerId: 'a', balance: 0, oldestUnpaidDate: null, aging: aging() }],
      },
      '2026-10-09',
    );
    expect(out.customers[0]).toMatchObject({ oldestUnpaidDate: null, oldestUnpaidDays: null });
  });
});

describe('usually pays in', () => {
  it('is hidden below 3 settled sales and rounded to whole days from 3', () => {
    expect(usuallyPaysInDays({ count: 0, meanDays: 0 })).toBeNull();
    expect(usuallyPaysInDays({ count: 2, meanDays: 30 })).toBeNull();
    expect(usuallyPaysInDays({ count: 3, meanDays: 24.4 })).toBe(24);
    expect(usuallyPaysInDays({ count: 6, meanDays: 24.5 })).toBe(25);
    expect(usuallyPaysInDays({ count: 3, meanDays: 0 })).toBe(0);
  });
});

describe('composeCustomerReceivable', () => {
  it('adds how long ago they last paid, relative to the Current Business Date', () => {
    const out = composeCustomerReceivable(customerSource(), '2026-10-09');
    expect(out.lastPayment).toEqual({
      amount: 40000,
      entryDate: '2026-09-18',
      method: 'UPI',
      daysAgo: 21,
    });
    expect(out.usuallyPaysInDays).toBe(24);
    expect(out.oldestUnpaidDays).toBe(8);
    expect(out.settlementCycle).toBe('OPEN');
  });

  it('hides, rather than zeroes, what has no data', () => {
    const out = composeCustomerReceivable(
      customerSource({ lastPayment: null, settled: { count: 2, meanDays: 9 }, vehicles: [] }),
      '2026-10-09',
    );
    expect(out.lastPayment).toBeNull();
    expect(out.usuallyPaysInDays).toBeNull();
    expect(out.vehicles).toEqual([]);
  });

  it('passes the vehicle spend through, largest first as read', () => {
    const out = composeCustomerReceivable(
      customerSource({
        vehicles: [
          { vehicleId: 'v-1', registration: 'A', type: 'Truck', amount: 300.004, litres: 12.345 },
          { vehicleId: 'v-2', registration: 'B', type: 'Bus', amount: 100, litres: 0 },
        ],
      }),
      '2026-10-09',
    );
    expect(out.vehicles).toEqual([
      { vehicleId: 'v-1', registration: 'A', type: 'Truck', amount: 300, litres: 12.35 },
      { vehicleId: 'v-2', registration: 'B', type: 'Bus', amount: 100, litres: 0 },
    ]);
  });
});

describe('GetReceivables', () => {
  it('reads under the caller organization with the Current Business Date, not the UTC date', async () => {
    const reader = new Reader();
    // 01:30 IST on the 10th is still the 9th in UTC; with a midnight Day Start the Business Date is the 10th.
    await new GetReceivables(reader).execute(
      { stationId: 'station-1' },
      ctxAt('2026-10-09T20:00:00Z', { businessDayStartsAt: '00:00' }),
    );
    expect(reader.summaryQuery).toEqual({
      organizationId: 'org-1',
      stationId: 'station-1',
      currentBusinessDate: '2026-10-10',
    });
  });

  it('keeps the previous Business Date until Day Start', async () => {
    const reader = new Reader();
    // 01:30 IST on the 10th with a 06:00 Day Start: still the 9th.
    await new GetReceivables(reader).execute(
      { stationId: 'station-1' },
      ctxAt('2026-10-09T20:00:00Z'),
    );
    expect(reader.summaryQuery?.currentBusinessDate).toBe('2026-10-09');
  });

  it('rolls to the next Business Date once Day Start has passed', async () => {
    const reader = new Reader();
    // 07:00 IST on the 10th.
    await new GetReceivables(reader).execute(
      { stationId: 'station-1' },
      ctxAt('2026-10-10T01:30:00Z'),
    );
    expect(reader.summaryQuery?.currentBusinessDate).toBe('2026-10-10');
  });

  it('refuses a missing station', async () => {
    const res = await new GetReceivables(new Reader()).execute({ stationId: '' }, ctx);
    expect(res.success).toBe(false);
  });
});

describe('GetCustomerReceivable', () => {
  it('measures "this month" per anchor: Credit Sales by Business Date, Collections by Entry Date', async () => {
    const reader = new Reader();
    // 03:00 IST on 1 Nov: the Business Date is still 31 Oct (before 06:00), the Entry Date is 1 Nov.
    const res = await new GetCustomerReceivable(reader).execute(
      { stationId: 'station-1', customerId: 'c-1' },
      ctxAt('2026-10-31T21:30:00Z'),
    );
    expect(res.success).toBe(true);
    expect(reader.customerQuery).toMatchObject({
      organizationId: 'org-1',
      customerId: 'c-1',
      currentBusinessDate: '2026-10-31',
      creditFrom: '2026-10-01',
      creditTo: '2026-10-31',
      paidFrom: '2026-11-01',
      paidTo: '2026-11-30',
    });
  });

  it('answers not found when the customer is not in the organization', async () => {
    const res = await new GetCustomerReceivable(new Reader(undefined, null)).execute(
      { stationId: 'station-1', customerId: 'c-9' },
      ctx,
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('refuses a missing customer id', async () => {
    const res = await new GetCustomerReceivable(new Reader()).execute(
      { stationId: 'station-1', customerId: '' },
      ctx,
    );
    expect(res.success).toBe(false);
  });
});
