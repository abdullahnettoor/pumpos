import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { invalidTypeError } from './zod-messages.js';
import '../index.js';

const message = (schema: z.ZodType, value: unknown): string => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a validation failure');
  return result.error.issues[0]!.message;
};

describe('Zod 3 messages under Zod 4 (#722)', () => {
  it('a missing value reads Required', () => {
    expect(message(z.object({ name: z.string() }), {})).toBe('Required');
  });

  it('a wrong type names the expected and received types', () => {
    expect(message(z.string(), 5)).toBe('Expected string, received number');
    expect(message(z.number(), 'x')).toBe('Expected number, received string');
    expect(message(z.number(), Number.NaN)).toBe('Expected number, received nan');
    expect(message(z.object({}), null)).toBe('Expected object, received null');
    expect(message(z.array(z.string()), {})).toBe('Expected array, received object');
    expect(message(z.number().int(), 1.5)).toBe('Expected integer, received float');
  });

  it('an infinite number is not finite', () => {
    expect(message(z.number().finite(), Number.POSITIVE_INFINITY)).toBe('Number must be finite');
  });

  it('string lengths', () => {
    expect(message(z.string().min(1), '')).toBe('String must contain at least 1 character(s)');
    expect(message(z.string().max(3), 'abcd')).toBe('String must contain at most 3 character(s)');
    expect(message(z.string().length(2), 'a')).toBe('String must contain exactly 2 character(s)');
  });

  it('number bounds', () => {
    expect(message(z.number().positive(), 0)).toBe('Number must be greater than 0');
    expect(message(z.number().nonnegative(), -1)).toBe('Number must be greater than or equal to 0');
    expect(message(z.number().lt(5), 5)).toBe('Number must be less than 5');
    expect(message(z.number().max(5), 6)).toBe('Number must be less than or equal to 5');
    expect(message(z.number().multipleOf(5), 6)).toBe('Number must be a multiple of 5');
  });

  it('array sizes', () => {
    expect(message(z.array(z.string()).min(1), [])).toBe(
      'Array must contain at least 1 element(s)',
    );
    expect(message(z.array(z.string()).max(1), ['a', 'b'])).toBe(
      'Array must contain at most 1 element(s)',
    );
  });

  it('enums and literals', () => {
    expect(message(z.enum(['CASH', 'CARD']), 'UPI')).toBe(
      "Invalid enum value. Expected 'CASH' | 'CARD', received 'UPI'",
    );
    expect(message(z.literal('FUEL'), 'OIL')).toBe('Invalid literal value, expected "FUEL"');
  });

  it('string formats', () => {
    expect(message(z.string().uuid(), 'x')).toBe('Invalid uuid');
    expect(message(z.string().guid(), 'x')).toBe('Invalid uuid');
    expect(message(z.string().email(), 'x')).toBe('Invalid email');
    expect(message(z.string().regex(/^\d+$/), 'x')).toBe('Invalid');
    expect(message(z.string().startsWith('SAL'), 'x')).toBe('Invalid input: must start with "SAL"');
  });

  it('unions, refinements and unknown keys', () => {
    expect(message(z.union([z.string(), z.number()]), true)).toBe('Invalid input');
    expect(
      message(
        z.string().refine(() => false),
        'x',
      ),
    ).toBe('Invalid input');
    expect(message(z.object({}).strict(), { a: 1 })).toBe("Unrecognized key(s) in object: 'a'");
  });

  it('custom messages still win', () => {
    expect(message(z.string().min(1, 'Name is required'), '')).toBe('Name is required');
    expect(message(z.object({ name: z.string({ error: 'Name please' }) }), {})).toBe('Name please');
  });
});

describe('invalidTypeError', () => {
  const amount = z.coerce.number(invalidTypeError('Amount is required')).positive('Positive');

  it('names a value that is not a number', () => {
    expect(message(amount, 'abc')).toBe('Amount is required');
    expect(message(z.number(invalidTypeError('Enter a number')), Number.NaN)).toBe(
      'Enter a number',
    );
  });

  it('leaves a missing value as Required, as Zod 3 did', () => {
    expect(message(z.number(invalidTypeError('Enter a number')), undefined)).toBe('Required');
  });

  it('leaves the checks to their own messages', () => {
    expect(message(amount, '-1')).toBe('Positive');
  });
});
