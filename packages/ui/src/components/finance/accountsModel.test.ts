import { describe, expect, it } from 'vitest';
import { accountTypeDetail } from '../../utils/ledgerLabels.js';
import {
  accountBalances,
  accountFlows,
  pairTransfers,
  plural,
  sumTransfers,
  type MovementRow,
} from './accountsModel.js';

const leg = (over: Partial<MovementRow>): MovementRow => ({
  id: 'm',
  entryDate: '2026-10-01',
  accountId: 'a',
  accountType: 'CASH_IN_HAND',
  accountName: 'Cash in Hand',
  direction: 'out',
  amount: '100',
  sourceType: 'TRANSFER',
  transferId: 't',
  notes: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

describe('accountTypeDetail (#530)', () => {
  it('hides the type only when the name is exactly the type, in any case', () => {
    expect(accountTypeDetail('Cash in Hand', 'CASH_IN_HAND')).toBeNull();
    expect(accountTypeDetail('  petty cash ', 'PETTY_CASH')).toBeNull();
    expect(accountTypeDetail('Bank of Baroda', 'BANK')).toBe('Bank');
    expect(accountTypeDetail('Owner Account', 'OWNER')).toBe('Owner');
    expect(accountTypeDetail('SBI Current', 'BANK')).toBe('Bank');
    expect(accountTypeDetail('Anything', null)).toBeNull();
  });
});

describe('accountBalances', () => {
  it('groups cash (in hand + petty), bank and card/UPI clearing', () => {
    expect(
      accountBalances([
        { id: '1', name: 'Cash', accountType: 'CASH_IN_HAND', balance: '100.50' },
        { id: '2', name: 'Petty', accountType: 'PETTY_CASH', balance: 20 },
        { id: '3', name: 'SBI', accountType: 'BANK', balance: '500' },
        { id: '4', name: 'BoB', accountType: 'BANK', balance: '-50' },
        { id: '5', name: 'POS', accountType: 'MERCHANT_CLEARING', balance: '30' },
        { id: '6', name: 'CMS', accountType: 'CMS', balance: '999' },
        { id: '7', name: 'Owner', accountType: 'OWNER', balance: '999' },
      ]),
    ).toEqual({ cash: 120.5, bank: 450, clearing: 30 });
  });
});

describe('pairTransfers', () => {
  it('pairs the out and in legs of each transfer, newest first, and skips other sources', () => {
    const rows = pairTransfers([
      leg({ id: '1', transferId: 't1', direction: 'out', sourceType: 'DEPOSIT', amount: '500' }),
      leg({
        id: '2',
        transferId: 't1',
        direction: 'in',
        sourceType: 'DEPOSIT',
        amount: '500',
        accountName: 'SBI',
        accountType: 'BANK',
      }),
      leg({ id: '3', transferId: 't2', entryDate: '2026-10-05', notes: 'Float' }),
      leg({
        id: '4',
        transferId: 't2',
        entryDate: '2026-10-05',
        direction: 'in',
        accountName: 'Petty Cash',
        accountType: 'PETTY_CASH',
        notes: 'Float',
      }),
      leg({ id: '5', transferId: 's1', sourceType: 'SETTLEMENT' }),
      leg({ id: '6', transferId: null, sourceType: 'EXPENSE' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 't2',
      kind: 'transfer',
      fromName: 'Cash in Hand',
      toName: 'Petty Cash',
      amount: 100,
      notes: 'Float',
    });
    expect(rows[1]).toMatchObject({
      id: 't1',
      kind: 'deposit',
      fromName: 'Cash in Hand',
      toName: 'SBI',
      toType: 'BANK',
      amount: 500,
    });
    expect(sumTransfers(rows)).toBe(600);
  });

  it('drops the generated "Transfer A → B" note, which only repeats the From and To', () => {
    const [t] = pairTransfers([
      leg({ id: '1', notes: 'Transfer SBI → BoB', accountName: 'SBI' }),
      leg({ id: '2', direction: 'in', notes: 'Transfer SBI → BoB', accountName: 'BoB' }),
    ]);
    expect(t.notes).toBeNull();
    const [d] = pairTransfers([
      leg({ id: '1', sourceType: 'DEPOSIT', notes: 'Deposit Cash in Hand → SBI' }),
      leg({
        id: '2',
        sourceType: 'DEPOSIT',
        direction: 'in',
        accountName: 'SBI',
        notes: 'Deposit Cash in Hand → SBI',
      }),
    ]);
    expect(d.notes).toBeNull();
  });

  it('keeps a leg whose partner is outside the list, with the other side blank', () => {
    const [t] = pairTransfers([leg({ id: '1', direction: 'in', accountName: 'SBI' })]);
    expect(t).toMatchObject({ fromName: null, toName: 'SBI' });
  });
});

describe('accountFlows', () => {
  it('sums money in and out inside the window, both ends included', () => {
    const w = { from: '2026-10-01', to: '2026-10-14' };
    expect(
      accountFlows(
        [
          { entryDate: '2026-09-30', direction: 'in', amount: '999' },
          { entryDate: '2026-10-01', direction: 'in', amount: '100' },
          { entryDate: '2026-10-14', direction: 'out', amount: '40.5' },
          { entryDate: '2026-10-15', direction: 'out', amount: '999' },
        ],
        w,
      ),
    ).toEqual({ moneyIn: 100, moneyOut: 40.5, count: 2 });
  });
});

describe('plural', () => {
  it('reads one and many', () => {
    expect(plural(1, 'deposit')).toBe('1 deposit');
    expect(plural(3, 'deposit')).toBe('3 deposits');
    expect(plural(0, 'entry', 'entries')).toBe('0 entries');
  });
});
