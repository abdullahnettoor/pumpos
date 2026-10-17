import { describe, expect, it } from 'vitest';
import type { StationMovements } from '../../../services/cloud.js';
import { buildCashBankSummary } from './cashBankSummary.js';

const acc = (
  accountId: string,
  accountType: string,
  accountName: string,
  opening = 0,
  shared = false,
) => ({
  accountId,
  accountType,
  accountName,
  shared,
  isActive: true,
  opening: String(opening),
});

let n = 0;
const mv = (
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  transferId: string | null = null,
) => ({
  id: `m${++n}`,
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

const DATA: StationMovements = {
  openings: [
    acc('cash', 'CASH_IN_HAND', 'Cash in Hand', 10_000),
    acc('petty', 'PETTY_CASH', 'Petty Cash', 500),
    acc('hdfc', 'BANK', 'HDFC ••4512', 50_000),
    acc('sbi', 'BANK', 'SBI ••0931', 20_000),
    acc('cms', 'CMS', 'CMS wallet', 0),
    acc('owner', 'OWNER', 'Owner', 0),
    acc('idle', 'BANK', 'Old ICICI', 0),
    acc('ho', 'BANK', 'Head office HDFC', 1_000, true),
  ],
  movements: [
    mv('cash', 'in', 8_000), // a shift's cash sales
    mv('cash', 'out', 1_000, 't1'), // cash in hand → petty cash
    mv('petty', 'in', 1_000, 't1'),
    mv('cash', 'out', 5_000, 't2'), // deposit cash → HDFC
    mv('hdfc', 'in', 5_000, 't2'),
    mv('hdfc', 'out', 2_000, 't3'), // HDFC → SBI
    mv('sbi', 'in', 2_000, 't3'),
    mv('sbi', 'out', 300), // a bank charge
    mv('sbi', 'out', 4_000, 't4'), // SBI → head office (shared, outside the report)
    mv('ho', 'in', 4_000, 't4'),
    mv('cms', 'in', 700),
  ],
};

describe('buildCashBankSummary (#531)', () => {
  const s = buildCashBankSummary(DATA);

  it('lists one row per account with its own opening, in, out and closing', () => {
    expect(s.cash.accounts.map((a) => a.accountName)).toEqual(['Cash in Hand', 'Petty Cash']);
    const cash = s.cash.accounts[0];
    expect(cash).toMatchObject({
      opening: 10_000,
      moneyIn: 8_000,
      moneyOut: 6_000,
      closing: 12_000,
    });
    // The account row keeps the transfer leg: it did move money for that account.
    expect(s.cash.accounts[1]).toMatchObject({ moneyIn: 1_000, closing: 1_500 });
  });

  it('leaves transfers inside a group out of the group totals, keeps deposits', () => {
    expect(s.cash.totals).toEqual({
      opening: 10_500,
      moneyIn: 8_000,
      moneyOut: 5_000,
      closing: 13_500,
    });
    expect(s.cash.internalTransfers).toBe(1_000);
    // HDFC → SBI is inside Bank; the deposit and the move to head office are not.
    expect(s.bank.totals).toEqual({
      opening: 70_000,
      moneyIn: 5_000,
      moneyOut: 4_300,
      closing: 70_700,
    });
    expect(s.bank.internalTransfers).toBe(2_000);
    expect(s.deposited).toBe(5_000);
  });

  it('the Cash + Bank total leaves out every transfer between two of its accounts', () => {
    expect(s.total).toEqual({ opening: 80_500, moneyIn: 8_000, moneyOut: 4_300, closing: 84_200 });
    // Closing is the sum of the account closings either way.
    const closings = [...s.cash.accounts, ...s.bank.accounts].reduce((t, a) => t + a.closing, 0);
    expect(s.total.closing).toBe(closings);
  });

  it('keeps CMS, clearing and Owner apart and organization-shared accounts out', () => {
    expect(s.other.accounts.map((a) => a.accountName)).toEqual(['CMS wallet', 'Owner']);
    expect(s.other.totals.moneyIn).toBe(700);
    const all = [...s.cash.accounts, ...s.bank.accounts, ...s.other.accounts];
    expect(all.find((a) => a.accountId === 'ho')).toBeUndefined();
  });

  it('hides accounts that neither moved nor hold money unless asked', () => {
    expect(s.idle).toBe(2); // Old ICICI, Owner
    expect(s.bank.shown.map((a) => a.accountName)).toEqual(['HDFC ••4512', 'SBI ••0931']);
    expect(s.other.shown.map((a) => a.accountName)).toEqual(['CMS wallet']);
    const all = buildCashBankSummary(DATA, { showAll: true });
    expect(all.bank.shown.map((a) => a.accountName)).toContain('Old ICICI');
    expect(all.idle).toBe(2);
  });

  it('is empty, not broken, before the data arrives', () => {
    const empty = buildCashBankSummary(undefined);
    expect(empty.total).toEqual({ opening: 0, moneyIn: 0, moneyOut: 0, closing: 0 });
    expect(empty.cash.accounts).toEqual([]);
  });
});
