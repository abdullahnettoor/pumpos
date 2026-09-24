import { describe, expect, it } from 'vitest';
import {
  collectionAccountTypes,
  filterFundingAccounts,
  reconcileFundingSelection,
  terminalsForMethod,
} from './fundingAccounts.js';
import type { FundingAccount } from '../services/cloud.js';

const acc = (id: string, accountType: FundingAccount['accountType']): FundingAccount => ({
  id,
  name: id,
  accountType,
  stationId: 's1',
});

describe('collectionAccountTypes', () => {
  it('maps each method to the account types the server accepts', () => {
    expect(collectionAccountTypes('Cash')).toEqual(['CASH_IN_HAND', 'PETTY_CASH']);
    expect(collectionAccountTypes('Card')).toEqual(['BANK', 'MERCHANT_CLEARING']);
    expect(collectionAccountTypes('UPI')).toEqual(['BANK', 'MERCHANT_CLEARING']);
    expect(collectionAccountTypes('BankTransfer')).toEqual(['BANK']);
  });
});

describe('reconcileFundingSelection', () => {
  const all = [acc('cash', 'CASH_IN_HAND'), acc('bank', 'BANK'), acc('clr', 'MERCHANT_CLEARING')];

  it('keeps a still-allowed choice', () => {
    expect(reconcileFundingSelection('bank', filterFundingAccounts(all, ['BANK', 'OWNER']))).toBe(
      'bank',
    );
  });

  it('preselects the only match', () => {
    expect(reconcileFundingSelection('', filterFundingAccounts(all, ['CASH_IN_HAND']))).toBe(
      'cash',
    );
  });

  it('clears a choice that is no longer allowed', () => {
    expect(
      reconcileFundingSelection('cash', filterFundingAccounts(all, ['BANK', 'MERCHANT_CLEARING'])),
    ).toBe('');
  });
});

describe('terminalsForMethod', () => {
  const terminals = [
    { id: 'a', isActive: true, supportsCard: true, supportsUpi: false },
    { id: 'b', isActive: true, supportsCard: false, supportsUpi: true },
    { id: 'c', isActive: false, supportsCard: true, supportsUpi: true },
  ];

  it('returns active terminals that accept the method', () => {
    expect(terminalsForMethod(terminals, 'Card').map((t) => t.id)).toEqual(['a']);
    expect(terminalsForMethod(terminals, 'UPI').map((t) => t.id)).toEqual(['b']);
    expect(terminalsForMethod(terminals, 'Cash')).toEqual([]);
  });
});
