import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { partialUpdate } from './partial-update.js';

const member = z
  .object({
    name: z.string().min(1),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    phone: z.string().optional(),
  })
  .strict();

describe('partialUpdate (#722)', () => {
  const update = partialUpdate(member);

  it('leaves an omitted field omitted, even when it has a creation default', () => {
    expect(update.parse({})).toEqual({});
    expect(update.parse({ name: 'Ravi' })).toEqual({ name: 'Ravi' });
  });

  it('keeps submitted values and their checks', () => {
    expect(update.parse({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
    expect(update.safeParse({ name: '' }).success).toBe(false);
    expect(update.safeParse({ status: 'GONE' }).success).toBe(false);
  });

  it('keeps the object rules (strict stays strict)', () => {
    expect(update.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('types every field as optional', () => {
    const value: z.infer<typeof update> = {};
    expect(value).toEqual({});
  });
});
