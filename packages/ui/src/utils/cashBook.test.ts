import { describe, expect, it } from 'vitest';
import { addDays, cashAccountTotals, sortCashBookAccounts } from './cashBook.js';

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('sortCashBookAccounts', () => {
  it('orders by account type then name', () => {
    const sorted = sortCashBookAccounts([
      { name: 'Owner', accountType: 'OWNER' as const },
      { name: 'SBI', accountType: 'BANK' as const },
      { name: 'HDFC', accountType: 'BANK' as const },
      { name: 'Petty', accountType: 'PETTY_CASH' as const },
      { name: 'Cash', accountType: 'CASH_IN_HAND' as const },
    ]);
    expect(sorted.map((a) => a.name)).toEqual(['Cash', 'Petty', 'HDFC', 'SBI', 'Owner']);
  });
});

describe('cashAccountTotals', () => {
  it('sums only Cash in Hand and Petty Cash', () => {
    const t = cashAccountTotals([
      { accountType: 'CASH_IN_HAND', opening: 100, moneyIn: 50, moneyOut: 20, closing: 130 },
      { accountType: 'PETTY_CASH', opening: 10, moneyIn: 0, moneyOut: 5, closing: 5 },
      { accountType: 'BANK', opening: 1000, moneyIn: 1, moneyOut: 1, closing: 1000 },
    ]);
    expect(t).toEqual({ opening: 110, moneyIn: 50, moneyOut: 25, closing: 135 });
  });
});
