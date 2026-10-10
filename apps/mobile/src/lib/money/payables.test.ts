import { describe, expect, it } from 'vitest';
import {
  oldestUnpaidLine,
  paidThisMonthTile,
  productRows,
  purchasedTile,
  quantityLabel,
  sinceLabel,
  supplierRowMeta,
  unpaidLabel,
} from './payables.js';

const payable = (over = {}) => ({
  supplierId: 's',
  balance: 100,
  unpaidCount: 2,
  oldestUnpaidDate: '2026-09-29',
  oldestUnpaidDays: 10,
  ...over,
});

describe('supplier row captions', () => {
  it('says how many are unpaid and since when', () => {
    expect(unpaidLabel(payable())).toBe('2 unpaid');
    expect(unpaidLabel(payable({ unpaidCount: 1 }))).toBe('1 unpaid');
    expect(sinceLabel(payable())).toBe('since 29 Sep');
  });

  it('says nothing when nothing is unpaid or the summary is not there (never "0 unpaid")', () => {
    expect(unpaidLabel(payable({ unpaidCount: 0 }))).toBeNull();
    expect(unpaidLabel(null)).toBeNull();
    expect(unpaidLabel(undefined)).toBeNull();
    expect(sinceLabel(payable({ oldestUnpaidDate: null }))).toBeNull();
    expect(sinceLabel(undefined)).toBeNull();
  });

  it('puts the unpaid count after the trade name / phone', () => {
    expect(supplierRowMeta('HPCL', payable())).toBe('HPCL · 2 unpaid');
    expect(supplierRowMeta('HPCL', null)).toBe('HPCL');
    expect(supplierRowMeta('', payable({ unpaidCount: 1 }))).toBe('1 unpaid');
  });
});

describe('oldestUnpaidLine', () => {
  it('names the oldest unpaid Purchase and how long it has waited', () => {
    expect(
      oldestUnpaidLine(
        payable({ unpaidCount: 1, oldestUnpaidDays: 0, oldestUnpaidDate: '2026-10-09' }),
      ),
    ).toBe('1 unpaid purchase · oldest 9 Oct (today)');
    expect(oldestUnpaidLine(payable())).toBe('2 unpaid purchases · oldest 29 Sep (10 days)');
  });

  it('is hidden with nothing unpaid (an advance or a settled supplier)', () => {
    expect(oldestUnpaidLine(payable({ unpaidCount: 0, oldestUnpaidDate: null }))).toBeNull();
    expect(oldestUnpaidLine(undefined)).toBeNull();
  });
});

describe('tiles', () => {
  it('purchased: value, purchase count and litres', () => {
    expect(
      purchasedTile({ purchased: 2072200, paid: 0, purchaseCount: 2, quantity: 22000 }),
    ).toEqual({ label: 'Purchased this month', value: '₹20.72L', sub: '2 purchases · 22,000 L' });
  });

  it('purchased: no litres when only products in units came in', () => {
    expect(purchasedTile({ purchased: 250, paid: 0, purchaseCount: 1, quantity: 0 }).sub).toBe(
      '1 purchase',
    );
  });

  it('paid: the last payment with its Funding Account type in words', () => {
    expect(
      paidThisMonthTile(
        { paid: 980000 },
        { amount: 980000, entryDate: '2026-10-06', method: 'BANK', fundingAccountName: 'SBI' },
      ),
    ).toEqual({ label: 'Paid this month', value: '₹9.8L', sub: 'Last: 6 Oct · Bank' });
    expect(
      paidThisMonthTile(
        { paid: 1 },
        { amount: 1, entryDate: '2026-10-06', method: 'CASH_IN_HAND', fundingAccountName: null },
      ).sub,
    ).toBe('Last: 6 Oct · Cash in Hand');
  });

  it('paid: an unknown method is left out, no payment yet says so', () => {
    expect(
      paidThisMonthTile(
        { paid: 1 },
        { amount: 1, entryDate: '2026-10-06', method: null, fundingAccountName: null },
      ).sub,
    ).toBe('Last: 6 Oct');
    expect(paidThisMonthTile({ paid: 0 }, null).sub).toBe('No payment yet');
  });
});

describe('purchases by product', () => {
  it('formats the quantity with its unit and the value compactly', () => {
    expect(quantityLabel(12000, 'L')).toBe('12,000 L');
    expect(
      productRows([{ productId: 'p', name: 'HSD', unit: 'L', quantity: 12000, value: 1043200 }]),
    ).toEqual([{ productId: 'p', name: 'HSD', quantity: '12,000 L', value: '₹10.43L' }]);
  });
});
