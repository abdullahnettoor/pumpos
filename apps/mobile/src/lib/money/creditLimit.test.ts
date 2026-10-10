import { describe, expect, it } from 'vitest';
import {
  creditLimitAccess,
  creditLimitFailure,
  parseCreditLimit,
  previewStanding,
  reusesIdempotencyKey,
} from './creditLimit.js';

describe('parseCreditLimit', () => {
  it('reads a non-negative amount', () => {
    expect(parseCreditLimit('150000')).toEqual({ ok: true, value: 150000 });
    expect(parseCreditLimit(' 1500.50 ')).toEqual({ ok: true, value: 1500.5 });
  });

  it('treats blank and zero as no limit (the same as the desktop form)', () => {
    expect(parseCreditLimit('')).toEqual({ ok: true, value: null });
    expect(parseCreditLimit('  ')).toEqual({ ok: true, value: null });
    expect(parseCreditLimit('0')).toEqual({ ok: true, value: null });
  });

  it('rejects a negative amount', () => {
    expect(parseCreditLimit('-1')).toEqual({ ok: false, message: 'Enter 0 or more.' });
  });

  it('rejects text and non-finite numbers', () => {
    expect(parseCreditLimit('abc').ok).toBe(false);
    expect(parseCreditLimit('1e999').ok).toBe(false);
  });

  it('rejects more than the column holds (numeric 12,2) and more than 2 decimals', () => {
    expect(parseCreditLimit('10000000000').ok).toBe(false);
    expect(parseCreditLimit('9999999999.99')).toEqual({ ok: true, value: 9999999999.99 });
    expect(parseCreditLimit('10.123')).toEqual({
      ok: false,
      message: 'Use at most 2 decimal places.',
    });
  });
});

describe('previewStanding', () => {
  const owes = { currentBalance: '61400', creditLimit: '100000' };

  it('shows where the Customer would stand at the new limit', () => {
    expect(previewStanding(owes, 50000).state).toBe('over');
    expect(previewStanding(owes, 70000).state).toBe('near');
    expect(previewStanding(owes, 200000).state).toBe('under');
  });

  it('has no band without a limit', () => {
    expect(previewStanding(owes, null).tone).toBeNull();
  });
});

describe('creditLimitAccess', () => {
  const base = { role: 'Owner', customerType: 'Fleet', accessMode: 'NORMAL' } as const;

  it('is offered to Owner and Manager (canChangeCreditLimit)', () => {
    expect(creditLimitAccess({ ...base, role: 'Owner' }).status).toBe('enabled');
    expect(creditLimitAccess({ ...base, role: 'Manager' }).status).toBe('enabled');
  });

  it('is hidden from every other role', () => {
    for (const role of ['Accountant', 'Staff', 'Attendant'] as const)
      expect(creditLimitAccess({ ...base, role }).status).toBe('hidden');
  });

  it('is hidden for a Regular Customer (credit limits belong to Credit and Fleet)', () => {
    expect(creditLimitAccess({ ...base, customerType: 'Regular' }).status).toBe('hidden');
  });

  it('is disabled, with the reason, while access is Restricted or Suspended', () => {
    for (const accessMode of ['RESTRICTED', 'SUSPENDED'] as const) {
      const a = creditLimitAccess({ ...base, accessMode });
      expect(a.status).toBe('disabled');
      expect(a).toHaveProperty('reason');
    }
  });

  it('stays offered when the Access Document is not loaded yet (the server decides)', () => {
    expect(creditLimitAccess({ ...base, accessMode: undefined }).status).toBe('enabled');
  });
});

describe('creditLimitFailure', () => {
  const failure = (code: string, message = 'server words', status = 403) =>
    Object.assign(new Error(message), { code, status });

  it("explains Restricted Access and Suspension in the server's words", () => {
    for (const code of ['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']) {
      const f = creditLimitFailure(failure(code));
      expect(f.message).toBe('server words');
    }
  });

  it('answers a validation refusal on the field', () => {
    const f = creditLimitFailure(failure('VALIDATION_ERROR', 'bad', 400));
    expect(f.message).toMatch(/valid amount/i);
  });

  it('answers FORBIDDEN and a missing customer plainly', () => {
    expect(creditLimitFailure(failure('FORBIDDEN')).message).toMatch(/permission/i);
    expect(creditLimitFailure(failure('NOT_FOUND', 'x', 404)).message).toMatch(/no longer/i);
  });

  it('passes any other refusal through (LIMIT_REACHED, network) and has a fallback', () => {
    expect(creditLimitFailure(failure('LIMIT_REACHED', 'Station limit reached', 409)).message).toBe(
      'Station limit reached',
    );
    expect(creditLimitFailure('weird').message).toMatch(/could not save/i);
  });
});

describe('reusesIdempotencyKey', () => {
  it('reuses the key when the outcome is unknown (network, 5xx) and drops it after a decided refusal', () => {
    expect(reusesIdempotencyKey(Object.assign(new Error('n'), { code: 'NETWORK' }))).toBe(true);
    expect(reusesIdempotencyKey(Object.assign(new Error('s'), { status: 503 }))).toBe(true);
    // 4xx answers are cached under the key, so a retry must use a fresh one.
    expect(reusesIdempotencyKey(Object.assign(new Error('r'), { status: 403 }))).toBe(false);
  });
});
