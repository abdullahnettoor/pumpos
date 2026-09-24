import { describe, expect, it } from 'vitest';
import { collectionPayload, expensePayload } from './officeRecordPayloads.js';

describe('office record payloads', () => {
  it('builds an expense body with entry date and funding account, no shift', () => {
    expect(
      expensePayload('s1', {
        entryDate: '2026-09-20',
        categoryId: 'c1',
        amount: 120,
        description: '',
        fundingAccountId: 'cash',
      }),
    ).toEqual({
      stationId: 's1',
      entryDate: '2026-09-20',
      fundingAccountId: 'cash',
      categoryId: 'c1',
      amount: 120,
      description: undefined,
    });
  });

  it('sends the terminal instead of the account for a Card collection', () => {
    const body = collectionPayload('s1', {
      entryDate: '2026-09-20',
      customerId: 'cu1',
      amount: 500,
      paymentMethod: 'Card',
      notes: '',
      fundingAccountId: 'bank',
      terminalId: 't1',
    });
    expect(body.terminalId).toBe('t1');
    expect(body.fundingAccountId).toBeUndefined();
  });

  it('drops a stale terminal for a Cash collection', () => {
    const body = collectionPayload('s1', {
      entryDate: '2026-09-20',
      customerId: 'cu1',
      amount: 500,
      paymentMethod: 'Cash',
      notes: '',
      fundingAccountId: 'cash',
      terminalId: 't1',
    });
    expect(body).toMatchObject({ fundingAccountId: 'cash', terminalId: undefined });
  });
});
