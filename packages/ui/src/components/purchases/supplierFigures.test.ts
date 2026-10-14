import { describe, expect, it } from 'vitest';
import { computeRange } from '../../pump-ds/index.js';
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { advanceFigures, paymentFigures, purchasedToday, purchasesIn } from './supplierFigures.js';

const clock = { timeZone: 'Asia/Kolkata' };
const today = computeRange('today', clock).from;
const lastMonth = computeRange('last-month', clock).from;

describe('supplier figures (#528)', () => {
  it('counts today by each purchase’s own anchor, as the payables report counts the month', () => {
    // 05:00 on the 14th, before a 06:00 Day Start: the business date is still the 13th.
    const anchors = { entryToday: '2026-10-14', businessToday: '2026-10-13' };
    const f = purchasedToday(
      [
        // A Fuel Purchase: an Office Record, no business day, dated by entry date.
        { id: 'fuel', entryDate: '2026-10-14', amount: '100' },
        // A Product Purchase on the 13th's business day, entered on the 14th.
        {
          id: 'lube',
          businessDayId: 'bd',
          businessDate: '2026-10-13',
          entryDate: '2026-10-14',
          amount: '40',
        },
        { id: 'old', businessDayId: 'bd0', businessDate: '2026-10-12', amount: '5' },
      ],
      anchors,
    );
    expect(f).toEqual({ total: 140, count: 2 });
  });

  it('dates a purchase by its business date first (the GST register’s rule); an undated one is in no range', () => {
    const range = { from: '2026-10-13', to: '2026-10-13' };
    const rows = purchasesIn(
      [
        { id: 'a', businessDate: '2026-10-13', entryDate: '2026-10-14', amount: 1 },
        { id: 'b', entryDate: '2026-10-14', amount: 1 },
        { id: 'c', amount: 1 },
      ],
      range,
    );
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('splits the month’s payments into cash and the other accounts, and counts the suppliers paid', () => {
    const row = (
      id: string,
      entryDate: string,
      amount: number,
      accountType: string,
      supplierId = 's1',
    ): SupplierPaymentRow => ({
      id,
      stationId: 'st',
      supplierId,
      supplierName: 'S',
      entryDate,
      amount,
      notes: null,
      createdAt: '',
      accountName: 'A',
      accountType,
    });
    const f = paymentFigures(
      [
        row('a', today, 50, 'CASH_IN_HAND'),
        row('b', today, 30.1, 'PETTY_CASH', 's2'),
        row('c', today, 200.2, 'BANK', 's2'),
        row('d', lastMonth, 999, 'BANK', 's3'),
      ],
      clock,
    );
    expect(f).toMatchObject({
      month: 280.3,
      monthCount: 3,
      cash: 80.1,
      other: 200.2,
      suppliers: 2,
      today: 280.3,
      todayCount: 3,
    });
  });

  it('adds up advances paid as a positive amount', () => {
    expect(
      advanceFigures([
        { id: 'a', name: 'A', isActive: true, currentBalance: '1000' },
        { id: 'b', name: 'B', isActive: true, currentBalance: '-250' },
        { id: 'c', name: 'C', isActive: false, currentBalance: '0' },
      ]),
    ).toEqual({ total: 250, count: 1 });
  });
});
