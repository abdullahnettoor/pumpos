import { describe, expect, it } from 'vite-plus/test';
import { computeRange } from '../../pump-ds/index.js';
import { collectionFigures, countByMethod, creditSaleFigures } from './ledgerKpis.js';

const clock = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const today = computeRange('today', { timeZone: clock.timeZone }).from;
const businessToday = computeRange('today', clock).from;

describe('Customers ledger tiles (#527)', () => {
  it('collections: today and this month by entry date, in paise', () => {
    const f = collectionFigures(
      [
        { id: 'a', entryDate: today, customerId: 'c1', amount: '0.10', paymentMethod: 'Cash' },
        { id: 'b', entryDate: today, customerId: 'c1', amount: '0.20', paymentMethod: 'UPI' },
        { id: 'c', entryDate: '2020-01-05', customerId: 'c2', amount: '500', paymentMethod: 'UPI' },
      ],
      { timeZone: clock.timeZone },
    );
    expect(f).toMatchObject({
      today: 0.3,
      todayCount: 2,
      month: 0.3,
      monthCount: 2,
      todayCustomers: 1,
      monthFrom: `${today.slice(0, 7)}-01`,
    });
  });

  it('credit sales: by business date; customers counted over the month', () => {
    const f = creditSaleFigures(
      [
        { id: 'a', businessDate: businessToday, customerId: 'c1', amount: 100 },
        { id: 'b', businessDate: businessToday, customerId: 'c2', amount: 50 },
        { id: 'c', businessDate: '2020-01-05', customerId: 'c3', amount: 9 },
      ],
      clock,
    );
    expect(f).toMatchObject({ today: 150, todayCount: 2, monthCustomers: 2 });
  });

  it('counts rows per payment method', () => {
    expect(
      countByMethod([
        { id: 'a', amount: 1, paymentMethod: 'UPI' },
        { id: 'b', amount: 1, paymentMethod: 'UPI' },
        { id: 'c', amount: 1, paymentMethod: 'Cash' },
      ]),
    ).toEqual({ UPI: 2, Cash: 1 });
  });
});
