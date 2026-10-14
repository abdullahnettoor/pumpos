import { describe, expect, it } from 'vitest';
import { balanceFigures, paymentFigures, purchaseFigures } from './supplierFigures.js';

describe('supplier figures (#528)', () => {
  it('dates an Office Record purchase by the calendar today, a day-sealed one by the business today', () => {
    // 05:00 on the 14th, before a 06:00 Day Start: the business date is still the 13th.
    const clock = { entryToday: '2026-10-14', businessToday: '2026-10-13' };
    const f = purchaseFigures(
      [
        { id: 'fuel', entryDate: '2026-10-14', amount: '100' },
        { id: 'lube', entryDate: null, businessDate: '2026-10-13', amount: '40' },
        { id: 'sep', entryDate: '2026-09-30', amount: '5' },
      ],
      clock,
    );
    expect(f).toEqual({ today: 140, todayCount: 2, month: 140, monthCount: 2 });
  });

  it('splits this month’s payments into cash and the other accounts', () => {
    const row = (id: string, entryDate: string, amount: number, accountType: string) => ({
      id,
      stationId: 'st',
      supplierId: 's',
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
        row('a', '2026-10-14', 50, 'CASH_IN_HAND'),
        row('b', '2026-10-02', 30, 'PETTY_CASH'),
        row('c', '2026-10-03', 200, 'BANK'),
        row('d', '2026-09-30', 999, 'BANK'),
      ],
      '2026-10-14',
    );
    expect(f).toMatchObject({ today: 50, todayCount: 1, month: 280, monthCount: 3 });
    expect(f.cashMonth).toBe(80);
    expect(f.otherMonth).toBe(200);
  });

  it('keeps what you owe apart from advances paid', () => {
    expect(
      balanceFigures([
        { id: 'a', name: 'A', isActive: true, currentBalance: '1000' },
        { id: 'b', name: 'B', isActive: true, currentBalance: '-250' },
        { id: 'c', name: 'C', isActive: false, currentBalance: '0' },
      ]),
    ).toEqual({ payable: 1000, payableCount: 1, advance: 250, advanceCount: 1 });
  });
});
