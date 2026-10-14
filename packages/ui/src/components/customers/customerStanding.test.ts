import { describe, expect, it } from 'vitest';
import type { ReceivablesSummary } from '@pump/shared';
import {
  buildStandings,
  filterStandings,
  receivableKpis,
  standingOf,
  type CustomerRow,
} from './customerStanding.js';

const customer = (over: Partial<CustomerRow> & { id: string }): CustomerRow => ({
  name: over.id,
  customerType: 'Credit',
  creditLimit: 0,
  currentBalance: 0,
  isActive: true,
  ...over,
});

const aging = { d0_7: 0, d8_30: 0, d30plus: 0 };

const summary: ReceivablesSummary = {
  total: 412000,
  customerCount: 3,
  aging: { d0_7: 30000, d8_30: 20000, d30plus: 362000 },
  customers: [
    {
      customerId: 'rtc',
      balance: 362000,
      oldestUnpaidDate: '2026-08-28',
      oldestUnpaidDays: 47,
      aging,
    },
    {
      customerId: 'sbt',
      balance: 30000,
      oldestUnpaidDate: '2026-10-01',
      oldestUnpaidDays: 13,
      aging,
    },
    {
      customerId: 'eod',
      balance: 20000,
      oldestUnpaidDate: '2026-09-14',
      oldestUnpaidDays: 30,
      aging,
    },
  ],
};

const list = [
  // Stored balances disagree with the server on purpose: the server wins.
  customer({ id: 'rtc', creditLimit: 300000, currentBalance: 1 }),
  customer({ id: 'sbt', creditLimit: 200000, currentBalance: 30000 }),
  customer({ id: 'eod', settlementCycle: 'EOD', currentBalance: 20000 }),
  customer({ id: 'adv', creditLimit: 25000, currentBalance: -2500 }),
  customer({ id: 'omc', isPrepaid: true, creditLimit: 10, currentBalance: 0 }),
];

describe('customer standing (#527)', () => {
  it('reads the receivable from the server summary, never the stored balance', () => {
    const { rows } = buildStandings(list, summary);
    expect(rows.map((r) => r.standing.receivable)).toEqual([362000, 30000, 20000, 0, 0]);
  });

  it('is overdue only past 30 days, and over limit only above a credit line', () => {
    const { rows } = buildStandings(list, summary);
    const by = Object.fromEntries(rows.map((r) => [r.customer.id, r.standing]));
    expect(by.rtc.overdueDays).toBe(47);
    expect(by.eod.overdueDays).toBeNull();
    expect(by.rtc.overLimitBy).toBe(62000);
    expect(by.sbt.overLimitBy).toBe(0);
    // A prepaid OMC card has no station credit line.
    expect(by.omc.overLimitBy).toBe(0);
  });

  it('keeps an advance apart from the receivable', () => {
    const s = standingOf(list[3], new Map());
    expect(s).toMatchObject({ receivable: 0, advance: 2500, paidUp: true });
  });

  it('counts each filter', () => {
    expect(buildStandings(list, summary).counts).toEqual({
      all: 5,
      overdue: 1,
      'over-limit': 1,
      'paid-up': 2,
      'eod-due': 1,
    });
  });

  it('without a summary falls back to the stored balance and calls nothing overdue', () => {
    const { rows, fromServer, counts } = buildStandings(list, undefined);
    expect(fromServer).toBe(false);
    expect(rows[0].standing.receivable).toBe(1);
    expect(counts.overdue).toBe(0);
  });

  it('filters by chip and search together', () => {
    const { rows } = buildStandings(list, summary);
    expect(filterStandings(rows, 'paid-up', '').map((r) => r.customer.id)).toEqual(['adv', 'omc']);
    expect(filterStandings(rows, 'all', 'SB').map((r) => r.customer.id)).toEqual(['sbt']);
    expect(filterStandings(rows, 'overdue', 'sbt')).toEqual([]);
  });

  it('takes the receivable tiles from the summary', () => {
    const kpis = receivableKpis(summary, buildStandings(list, summary));
    expect(kpis).toEqual({
      total: 412000,
      owing: 3,
      overdue: 362000,
      overdueCustomers: 1,
      oldestOverdueDays: 47,
      overLimit: 1,
      worstOverLimit: { name: 'rtc', by: 62000 },
    });
  });
});
