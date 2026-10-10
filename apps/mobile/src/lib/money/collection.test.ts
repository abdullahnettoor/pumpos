import { describe, expect, it } from 'vitest';
import {
  amountAfterCollection,
  applyCollectionToCustomers,
  balanceAfterPayment,
  collectionAccess,
  collectionFailure,
  collectionFormSchema,
  collectionRequest,
  entryDateToday,
  isEarlierAttemptReceived,
  keepsIdempotencyKey,
  sameCollectionEntries,
  type CollectionForm,
} from './collection.js';

const TODAY = '2026-10-10';
const schema = collectionFormSchema(TODAY);

const form = (over: Partial<CollectionForm> = {}): CollectionForm => ({
  amount: '5000',
  paymentMethod: 'Cash',
  fundingAccountId: 'acc-cash',
  entryDate: TODAY,
  notes: '',
  ...over,
});

const issues = (over: Partial<CollectionForm>) => {
  const r = schema.safeParse(form(over));
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('collectionAccess', () => {
  it.each(['Owner', 'Manager', 'Accountant', 'Staff'] as const)('%s may record', (role) => {
    expect(collectionAccess({ role, accessMode: 'NORMAL' })).toEqual({ status: 'enabled' });
  });

  it('hides the action from the Attendant (same rule as the server guard)', () => {
    expect(collectionAccess({ role: 'Attendant', accessMode: 'NORMAL' })).toEqual({
      status: 'hidden',
    });
  });

  it('stays enabled under Restricted Access: the route is declared FINISH_OPEN_WORK', () => {
    expect(collectionAccess({ role: 'Owner', accessMode: 'RESTRICTED' })).toEqual({
      status: 'enabled',
    });
  });

  it('is disabled with a reason while the organization is suspended', () => {
    const a = collectionAccess({ role: 'Owner', accessMode: 'SUSPENDED' });
    expect(a.status).toBe('disabled');
    expect(a.status === 'disabled' && a.reason).toMatch(/suspended/i);
  });

  it('does not refuse while the Access Document is unknown: the server decides', () => {
    expect(collectionAccess({ role: 'Owner' })).toEqual({ status: 'enabled' });
  });
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

describe('collectionFormSchema', () => {
  it('accepts a valid cash collection', () => {
    expect(schema.safeParse(form()).success).toBe(true);
  });

  it('needs an amount above zero', () => {
    expect(issues({ amount: '' }).amount).toBe('Amount is required');
    expect(issues({ amount: '0' }).amount).toBe('Amount must be positive');
    expect(issues({ amount: '-5' }).amount).toBe('Amount must be positive');
    expect(issues({ amount: 'abc' }).amount).toBeTruthy();
  });

  it('holds the amount to the column (numeric 12,2): 2 decimals, bounded', () => {
    expect(issues({ amount: '10.123' }).amount).toBe('Use at most 2 decimal places.');
    expect(issues({ amount: '10000000000' }).amount).toBe('That is more than a payment can hold.');
    expect(schema.safeParse(form({ amount: '9999999999.99' })).success).toBe(true);
  });

  it('needs the account the money landed in (the shared collection rule)', () => {
    expect(issues({ fundingAccountId: '' }).fundingAccountId).toBe('Choose the account');
  });

  it('needs a real calendar date that is not in the future', () => {
    expect(issues({ entryDate: '' }).entryDate).toBeTruthy();
    expect(issues({ entryDate: '2026-10-11' }).entryDate).toBe('The date cannot be in the future.');
    expect(schema.safeParse(form({ entryDate: '2026-09-30' })).success).toBe(true);
  });

  it('keeps the reference to 500 characters', () => {
    expect(issues({ notes: 'x'.repeat(501) }).notes).toBeTruthy();
    expect(schema.safeParse(form({ notes: 'x'.repeat(500) })).success).toBe(true);
  });
});

describe('collectionRequest', () => {
  it('is an Office Record: station + entry date + funding account, no shift', () => {
    const body = collectionRequest('st-1', 'c-1', form({ notes: '  UPI ref 4471 ' }));
    expect(body).toEqual({
      stationId: 'st-1',
      entryDate: TODAY,
      fundingAccountId: 'acc-cash',
      terminalId: undefined,
      customerId: 'c-1',
      amount: 5000,
      paymentMethod: 'Cash',
      notes: 'UPI ref 4471',
    });
    expect(body).not.toHaveProperty('shiftId');
  });

  it('leaves the reference out when blank', () => {
    expect(collectionRequest('st-1', 'c-1', form({ notes: '   ' })).notes).toBeUndefined();
  });
});

describe('balances', () => {
  it('previews the balance after the payment', () => {
    expect(balanceAfterPayment(12000, 5000)).toBe(7000);
    expect(balanceAfterPayment(1000, 1500)).toBe(-500);
    expect(balanceAfterPayment(0.1 + 0.2, 0.3)).toBe(0);
  });

  it('describes it: owes, settled or advance', () => {
    expect(amountAfterCollection(7000)).toEqual({ kind: 'owes', amount: 7000 });
    expect(amountAfterCollection(0)).toEqual({ kind: 'settled', amount: 0 });
    expect(amountAfterCollection(-500)).toEqual({ kind: 'advance', amount: 500 });
  });

  it('writes the payment into cached customers lists, keeping each balance in its own type', () => {
    const list = [
      { id: 'c1', currentBalance: '12000.50' },
      { id: 'c2', currentBalance: 300 },
    ];
    expect(applyCollectionToCustomers(list, 'c1', 5000)).toEqual([
      { id: 'c1', currentBalance: '7000.50' },
      { id: 'c2', currentBalance: 300 },
    ]);
    expect(applyCollectionToCustomers([{ id: 'c2', currentBalance: 300 }], 'c2', 100.25)).toEqual([
      { id: 'c2', currentBalance: 199.75 },
    ]);
    expect(applyCollectionToCustomers(undefined, 'c1', 1)).toBeUndefined();
  });
});

describe('collectionFailure', () => {
  const e = (code: string, message = 'server says no', status = 400) =>
    Object.assign(new Error(message), { code, status });

  it('shows the access refusals with the server wording', () => {
    expect(
      collectionFailure(e('ORGANIZATION_SUSPENDED', 'Suspended. Contact PumpOS.')).message,
    ).toBe('Suspended. Contact PumpOS.');
    expect(collectionFailure(e('SUBSCRIPTION_RESTRICTED', 'Restricted.')).message).toBe(
      'Restricted.',
    );
  });

  it('names the other refusals', () => {
    expect(collectionFailure(e('FORBIDDEN')).message).toMatch(/permission/i);
    expect(collectionFailure(e('NOT_FOUND')).message).toMatch(/no longer available/i);
  });

  it('keeps the server message for a validation refusal (inactive account, future date)', () => {
    expect(collectionFailure(e('VALIDATION_ERROR', 'Account "Cash" is inactive')).message).toBe(
      'Account "Cash" is inactive',
    );
  });

  it('falls back to a retry hint', () => {
    expect(collectionFailure(new Error('')).message).toMatch(/try again/i);
    expect(collectionFailure(undefined).message).toMatch(/try again/i);
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

  it('compares entries as the server reads them (trimmed)', () => {
    const a = form({ amount: '5000', notes: 'ref' });
    expect(sameCollectionEntries(a, form({ amount: ' 5000 ', notes: ' ref ' }))).toBe(true);
    expect(sameCollectionEntries(a, form({ amount: '4500', notes: 'ref' }))).toBe(false);
    expect(
      sameCollectionEntries(a, form({ amount: '5000', notes: 'ref', paymentMethod: 'UPI' })),
    ).toBe(false);
  });
});
