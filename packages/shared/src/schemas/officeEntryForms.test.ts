import { describe, expect, it } from 'vitest';
import { collectionEntryFormSchema, expenseEntryFormSchema } from './validation.js';

describe('expenseEntryFormSchema', () => {
  const base = { entryDate: '2026-09-01', categoryId: 'c1', amount: 10 };

  it('requires a funding account', () => {
    const r = expenseEntryFormSchema.safeParse({ ...base, fundingAccountId: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Choose the account');
  });

  it('requires a YYYY-MM-DD entry date', () => {
    expect(
      expenseEntryFormSchema.safeParse({ ...base, entryDate: '', fundingAccountId: 'a' }).success,
    ).toBe(false);
    expect(expenseEntryFormSchema.safeParse({ ...base, fundingAccountId: 'a' }).success).toBe(true);
  });
});

describe('collectionEntryFormSchema', () => {
  const base = { entryDate: '2026-09-01', amount: 10 };

  it('requires an account unless a Card/UPI terminal is chosen', () => {
    expect(collectionEntryFormSchema.safeParse({ ...base, paymentMethod: 'Cash' }).success).toBe(
      false,
    );
    expect(
      collectionEntryFormSchema.safeParse({ ...base, paymentMethod: 'Card', terminalId: 't1' })
        .success,
    ).toBe(true);
    expect(
      collectionEntryFormSchema.safeParse({ ...base, paymentMethod: 'Cash', terminalId: 't1' })
        .success,
    ).toBe(false);
  });
});
