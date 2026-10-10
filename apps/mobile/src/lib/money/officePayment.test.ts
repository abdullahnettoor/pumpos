import { describe, expect, it } from 'vitest';
import {
  applyPaymentToParties,
  balanceAfterPayment,
  classifyBalance,
  entryDateToday,
  isEarlierAttemptReceived,
  keepsIdempotencyKey,
  officePaymentFailure,
  sameOfficeEntries,
  type OfficePaymentFields,
} from './officePayment.js';

const WORDING = { forbidden: 'no permission', notFound: 'gone' };

const fields = (over: Partial<OfficePaymentFields> = {}): OfficePaymentFields => ({
  amount: '5000',
  paymentMethod: 'Cash',
  fundingAccountId: 'acc-cash',
  entryDate: '2026-10-10',
  notes: '',
  ...over,
});

describe('entryDateToday', () => {
  it('is the station-timezone calendar date, never rolled back by a Day Start', () => {
    // 22:00 UTC on the 9th is 03:30 on the 10th in India (before any 06:00 day start).
    const now = new Date('2026-10-09T22:00:00Z');
    expect(entryDateToday('Asia/Kolkata', now)).toBe('2026-10-10');
    expect(entryDateToday('UTC', now)).toBe('2026-10-09');
  });

  it('falls back to India when the station has no timezone', () => {
    expect(entryDateToday(undefined, new Date('2026-10-09T22:00:00Z'))).toBe('2026-10-10');
  });
});

describe('balances', () => {
  it('previews the balance after the payment', () => {
    expect(balanceAfterPayment(12000, 5000)).toBe(7000);
    expect(balanceAfterPayment(1000, 1500)).toBe(-500);
    expect(balanceAfterPayment(0.1 + 0.2, 0.3)).toBe(0);
  });

  it('describes it: owes, settled or advance', () => {
    expect(classifyBalance(7000)).toEqual({ kind: 'owes', amount: 7000 });
    expect(classifyBalance(0)).toEqual({ kind: 'settled', amount: 0 });
    expect(classifyBalance(-500)).toEqual({ kind: 'advance', amount: 500 });
  });

  it('writes the payment into cached customers lists, keeping each balance in its own type', () => {
    const list = [
      { id: 'c1', currentBalance: '12000.50' },
      { id: 'c2', currentBalance: 300 },
    ];
    expect(applyPaymentToParties(list, 'c1', 5000)).toEqual([
      { id: 'c1', currentBalance: '7000.50' },
      { id: 'c2', currentBalance: 300 },
    ]);
    expect(applyPaymentToParties([{ id: 'c2', currentBalance: 300 }], 'c2', 100.25)).toEqual([
      { id: 'c2', currentBalance: 199.75 },
    ]);
    expect(applyPaymentToParties(undefined, 'c1', 1)).toBeUndefined();
  });
});

describe('idempotency keys', () => {
  const err = (code: string, message: string, status?: number) =>
    Object.assign(new Error(message), { code, status });

  it('keeps the key while the outcome is unknown, replaces it once decided', () => {
    expect(keepsIdempotencyKey(err('NETWORK', 'Network error'))).toBe(true);
    expect(keepsIdempotencyKey(err('INTERNAL', 'boom', 500))).toBe(true);
    expect(
      keepsIdempotencyKey(
        err('CONFLICT', 'A request with this Idempotency-Key is already in progress', 409),
      ),
    ).toBe(true);
    expect(keepsIdempotencyKey(err('VALIDATION_ERROR', 'bad', 400))).toBe(false);
    expect(keepsIdempotencyKey(err('FORBIDDEN', 'no', 403))).toBe(false);
  });

  it('a conflict over changed content means the earlier attempt arrived', () => {
    expect(
      isEarlierAttemptReceived(
        err(
          'CONFLICT',
          'This Idempotency-Key was already used with different request content',
          409,
        ),
      ),
    ).toBe(true);
    expect(isEarlierAttemptReceived(err('NETWORK', 'Network error'))).toBe(false);
  });

  it('any other conflict is not "the earlier attempt arrived"', () => {
    const business = err('CONFLICT', 'This customer was archived', 409);
    expect(isEarlierAttemptReceived(business)).toBe(false);
    expect(keepsIdempotencyKey(business)).toBe(false);
    expect(
      isEarlierAttemptReceived(
        err('CONFLICT', 'This Idempotency-Key belongs to another user', 409),
      ),
    ).toBe(false);
    expect(
      isEarlierAttemptReceived(
        err('CONFLICT', 'A request with this Idempotency-Key is already in progress', 409),
      ),
    ).toBe(false);
    expect(officePaymentFailure(business, WORDING).message).toBe('This customer was archived');
  });

  it('compares entries as the server reads them (trimmed)', () => {
    const a = fields({ amount: '5000', notes: 'ref' });
    expect(sameOfficeEntries(a, fields({ amount: ' 5000 ', notes: ' ref ' }))).toBe(true);
    expect(sameOfficeEntries(a, fields({ amount: '4500', notes: 'ref' }))).toBe(false);
    expect(
      sameOfficeEntries(a, fields({ amount: '5000', notes: 'ref', paymentMethod: 'UPI' })),
    ).toBe(false);
  });
});
