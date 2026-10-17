import { describe, expect, it } from 'vitest';
import { moneyEntries, officeRecords, partyDateBasis, partyEntries } from './adapters.js';
import { buildLedgerStatement } from './model.js';
import type { DailyCashBookAccount } from '../services/cloud.js';

describe('partyEntries', () => {
  it('dates a customer sale by Business Date and a collection by Entry Date', () => {
    expect(partyDateBasis('Credit Sale', 'customer')).toBe('business');
    expect(partyDateBasis('Adjustment', 'customer')).toBe('business');
    expect(partyDateBasis('Collection', 'customer')).toBe('entry');
    // Supplier rows are office records: a Fuel Purchase and a Payment carry an Entry Date.
    expect(partyDateBasis('Purchase', 'supplier')).toBe('entry');
    expect(partyDateBasis('Payment', 'supplier')).toBe('entry');
  });

  it('signs what reduces the balance negative and keeps the reference on its own', () => {
    const [sale, col] = partyEntries(
      [
        { id: 's', transactionType: 'Credit Sale', amount: '100.00', businessDate: '2026-10-01' },
        {
          id: 'c',
          transactionType: 'Collection',
          amount: '40.00',
          businessDate: '2026-10-02',
          method: 'UPI',
          reference: 'COL-1',
        },
      ],
      'customer',
    );
    expect(sale).toMatchObject({ amount: 100, basis: 'business', particulars: 'Credit Sale' });
    expect(col).toMatchObject({
      amount: -40,
      basis: 'entry',
      particulars: 'Payment received',
      detail: 'UPI',
      reference: 'COL-1',
    });
  });

  it('names what a supplier purchase bought', () => {
    const [p] = partyEntries(
      [{ id: 'p', transactionType: 'Purchase', amount: '10', productName: 'HSD' }],
      'supplier',
    );
    expect(p.particulars).toBe('Purchase · HSD');
    expect(p.amount).toBe(10);
  });
});

describe('moneyEntries', () => {
  it('money in raises a cash or bank account; money out lowers it', () => {
    const rows = moneyEntries([
      { id: 'a', direction: 'in', amount: '50', sourceType: 'COLLECTION', entryDate: '2026-10-01' },
      { id: 'b', direction: 'out', amount: 20, sourceType: 'EXPENSE', entryDate: '2026-10-01' },
    ]);
    expect(rows.map((r) => [r.amount, r.basis, r.source])).toEqual([
      [50, 'entry', 'COLLECTION'],
      [-20, 'entry', 'EXPENSE'],
    ]);
  });

  it('an owner-funded payment raises what the business owes the owner (a Credit)', () => {
    const s = buildLedgerStatement(
      moneyEntries(
        [{ id: 'o', direction: 'out', amount: 500, source: 'Expense', date: '2026-10-01' }],
        {
          owner: true,
        },
      ),
      { kind: 'owner' },
    );
    expect(s.rows[0]).toMatchObject({ source: 'EXPENSE', credit: 500, debit: null, balance: 500 });
  });

  it('keys legacy money-movement sources into the ledger vocabulary', () => {
    const [r] = moneyEntries([
      { id: 'x', direction: 'out', amount: 1, source: 'Supplier Payment', label: 'Payment · HPCL' },
    ]);
    expect(r).toMatchObject({ source: 'SUPPLIER_PAYMENT', detail: 'Payment · HPCL' });
  });
});

describe('officeRecords (Dashboard: Today in the office)', () => {
  const e = (id: string, direction: 'in' | 'out', sourceType: string, at: string) => ({
    id,
    direction,
    amount: 10,
    sourceType,
    sourceId: sourceType === 'TRANSFER' ? 'tx1' : id,
    notes: null,
    createdAt: at,
  });

  it('keeps a transfer once (its outgoing leg) and sorts newest first', () => {
    const rows = officeRecords([
      {
        name: 'Cash',
        entries: [
          e('a', 'out', 'TRANSFER', '2026-10-12T10:00'),
          e('c', 'in', 'COLLECTION', '2026-10-12T08:00'),
        ],
      },
      { name: 'Safe', entries: [e('b', 'in', 'TRANSFER', '2026-10-12T10:00')] },
    ] as unknown as DailyCashBookAccount[]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
    // No party or note: the account it moved through is the detail.
    expect(rows[0]).toMatchObject({ detail: 'Cash', amount: -10 });
  });
});
