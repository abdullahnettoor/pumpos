import { describe, expect, it } from 'vitest';
import { summarizeCustomerBalances } from '../CustomersList.js';

describe('summarizeCustomerBalances', () => {
  it('separates receivables from customer advances without netting them', () => {
    expect(
      summarizeCustomerBalances([
        { currentBalance: '15000' },
        { currentBalance: '-10000' },
        { currentBalance: '2500' },
      ]),
    ).toEqual({ receivables: 17500, advances: 10000 });
  });
});
