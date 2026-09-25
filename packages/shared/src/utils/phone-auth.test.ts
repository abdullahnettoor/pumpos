import { describe, expect, it } from 'vitest';
import { normalizeIndianMobile, phoneToAuthEmail } from './phone-auth.js';
import {
  indianMobileSchema,
  optionalIndianMobileSchema,
  userSchema,
} from '../schemas/validation.js';

describe('normalizeIndianMobile (#300)', () => {
  it.each([
    '98765 43210',
    '+91 9876543210',
    '09876543210',
    '919876543210',
    '+91-98765-43210',
    '9876543210',
  ])('stores %s as +919876543210', (raw) => {
    expect(normalizeIndianMobile(raw)).toBe('+919876543210');
  });

  it.each(['', '12345', '5876543210', '98765432101', '+1 9876543210', 'abcdefghij', null])(
    'rejects %s',
    (raw) => {
      expect(normalizeIndianMobile(raw as string | null)).toBeNull();
    },
  );

  it('gives every spelling the same login handle', () => {
    const handles = new Set(
      ['98765 43210', '+91 9876543210', '09876543210', '+919876543210'].map((p) =>
        phoneToAuthEmail(p),
      ),
    );
    expect([...handles]).toEqual(['919876543210@users.pumpos.app']);
  });
});

describe('Indian mobile schemas', () => {
  it('normalizes a valid number and explains an invalid one', () => {
    expect(indianMobileSchema.parse('098765 43210')).toBe('+919876543210');
    const bad = indianMobileSchema.safeParse('12345');
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toMatch(/Indian mobile/);
  });

  it('treats a blank optional phone as none', () => {
    expect(optionalIndianMobileSchema.parse('')).toBeNull();
    expect(optionalIndianMobileSchema.parse('  ')).toBeNull();
    expect(optionalIndianMobileSchema.parse(null)).toBeNull();
    expect(optionalIndianMobileSchema.safeParse('123').success).toBe(false);
  });

  it('refuses an invalid phone on the user request schema', () => {
    const base = { fullName: 'Ravi K', status: 'ACTIVE' as const };
    expect(userSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(userSchema.safeParse({ ...base, phone: '98765 43210' }).success).toBe(true);
    expect(userSchema.safeParse({ ...base, phone: '' }).success).toBe(true);
  });
});
