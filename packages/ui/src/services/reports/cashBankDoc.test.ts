import { describe, expect, it } from 'vite-plus/test';
import { buildCashBankSummary } from '../../components/reports/cash-bank/cashBankSummary.js';
import { cashBankDocTables } from './cashBankDoc.js';

const acc = (accountId: string, accountType: string, accountName: string, opening = 0) => ({
  accountId,
  accountType,
  accountName,
  shared: false,
  isActive: true,
  opening: String(opening),
});
const mv = (
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  transferId: string | null,
) => ({
  id: `${accountId}-${direction}-${amount}`,
  entryDate: '2026-10-10',
  accountId,
  accountType: '',
  accountName: '',
  direction,
  amount: String(amount),
  sourceType: transferId ? 'TRANSFER' : 'OTHER',
  transferId,
  notes: null,
  createdAt: '2026-10-10T05:00:00.000Z',
});

describe('CashBankDoc (#531)', () => {
  it('prints the rows and totals the screen shows, Cash + Bank closing the Bank table', () => {
    const summary = buildCashBankSummary({
      openings: [
        acc('cash', 'CASH_IN_HAND', 'Cash in Hand', 1_000),
        acc('petty', 'PETTY_CASH', 'Petty Cash'),
        acc('hdfc', 'BANK', 'HDFC ••4512', 5_000),
        acc('cms', 'CMS', 'CMS wallet'),
      ],
      movements: [
        mv('cash', 'out', 200, 't1'),
        mv('petty', 'in', 200, 't1'),
        mv('cms', 'in', 50, null),
      ],
    });
    const { groups, total, other } = cashBankDocTables(summary);
    expect(groups.map((g) => g.title)).toEqual(['CASH', 'BANK']);
    expect(groups[0].rows.map((r) => r[0].text)).toEqual(['Cash in Hand', 'Petty Cash']);
    // "Cash in Hand" is its own type: no detail line repeating it. HDFC says it is a bank.
    expect(groups[0].rows[0][0].detail).toBeUndefined();
    expect(groups[1].rows[0][0].detail).toBe('Bank');
    expect(groups[0].total.map((c) => c.text)).toEqual([
      'Cash total excl. transfers within cash',
      '₹1,000.00',
      '₹0.00',
      '₹0.00',
      '₹1,000.00',
    ]);
    expect(total[0].text).toBe('Cash + Bank, excl. transfers between them');
    expect(total[4].text).toBe('₹6,000.00');
    expect(other?.rows.map((r) => r[0].text)).toEqual(['CMS wallet']);
  });
});
