import { describe, expect, it } from 'vitest';
import { buildStatement, deltaOf, type LedgerRow } from './statement.js';
import { compactRupees, signedRupees } from './format.js';

const row = (
  id: string,
  transactionType: string,
  amount: number,
  businessDate: string,
  extra: Partial<LedgerRow> = {},
): LedgerRow => ({ id, transactionType, amount: String(amount), businessDate, ...extra });

// Oldest first, as the ledger endpoint returns them.
const LEDGER: LedgerRow[] = [
  row('o', 'Opening Balance', 5000, '2026-08-31'),
  row('a', 'Credit Sale', 5375, '2026-09-16'),
  row('b', 'Collection', 4000, '2026-09-18', { notes: 'UPI' }),
  row('c', 'Credit Sale', 12540, '2026-10-07'),
  row('d', 'Credit Sale', 8510, '2026-10-08'),
];

describe('buildStatement', () => {
  it('runs the balance from the oldest row and ends on the Customer balance', () => {
    const s = buildStatement(LEDGER);
    // Σ credit sales + opening − collections
    expect(s.closingBalance).toBe(5000 + 5375 - 4000 + 12540 + 8510);
    const all = s.months.flatMap((m) => m.entries);
    expect(all.map((e) => e.balance)).toEqual([27425, 18915, 6375, 10375, 5000]);
  });

  it('lists newest first, grouped by month with a heading', () => {
    const s = buildStatement(LEDGER);
    expect(s.months.map((m) => m.label)).toEqual(['October 2026', 'September 2026', 'August 2026']);
    expect(s.months[0].entries.map((e) => e.key)).toEqual(['d', 'c']);
    expect(s.months[1].entries.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('labels the four ledger types and shows a collection as a reduction', () => {
    const entries = buildStatement(LEDGER).months.flatMap((m) => m.entries);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(byKey.o.label).toBe('Opening balance');
    expect(byKey.a.label).toBe('Credit sale');
    expect(byKey.b).toMatchObject({
      label: 'Payment received',
      delta: -4000,
      meta: '18 Sep · UPI',
    });
    expect(
      buildStatement([row('x', 'Adjustment', 100, '2026-10-01')]).months[0].entries[0],
    ).toMatchObject({ label: 'Adjustment', delta: 100 });
  });

  it('pages: shows the newest N, keeps balances computed over everything', () => {
    const s = buildStatement(LEDGER, 2);
    expect(s).toMatchObject({ shown: 2, total: 5, hasMore: true });
    expect(s.months).toHaveLength(1);
    expect(s.months[0].entries[0].balance).toBe(27425);
    expect(buildStatement(LEDGER, 99).hasMore).toBe(false);
  });

  it('has no closing balance and no months for an empty ledger', () => {
    expect(buildStatement([])).toMatchObject({ months: [], total: 0, closingBalance: null });
  });

  it('does not drift on paise', () => {
    const s = buildStatement([
      row('a', 'Credit Sale', 0.1, '2026-10-01'),
      row('b', 'Credit Sale', 0.2, '2026-10-02'),
    ]);
    expect(s.closingBalance).toBe(0.3);
  });

  it('falls back to the created-at date, and tolerates an unknown type', () => {
    const s = buildStatement([
      { id: 'z', transactionType: 'Writeoff', amount: 10, createdAt: '2026-10-09T05:00:00Z' },
    ]);
    expect(s.months[0]).toMatchObject({ label: 'October 2026' });
    expect(s.months[0].entries[0]).toMatchObject({ label: 'Writeoff', meta: '9 Oct' });
  });

  it('only a Collection reduces the balance', () => {
    expect(deltaOf('Collection', 50)).toBe(-50);
    expect(deltaOf('Credit Sale', 50)).toBe(50);
    expect(deltaOf(null, 50)).toBe(50);
  });
});

describe('money formatting', () => {
  it('compacts to lakh and crore', () => {
    expect(compactRupees(200000)).toBe('₹2L');
    expect(compactRupees(150000)).toBe('₹1.5L');
    expect(compactRupees(125000)).toBe('₹1.25L');
    expect(compactRupees(24000000)).toBe('₹2.4Cr');
    expect(compactRupees(8500)).toBe('₹8,500');
  });

  it('puts the sign before the rupee', () => {
    expect(signedRupees(-125)).toBe('−₹125.00');
    expect(signedRupees(125)).toBe('₹125.00');
  });
});
