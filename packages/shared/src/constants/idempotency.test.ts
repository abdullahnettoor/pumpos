import { describe, expect, it } from 'vitest';
import { IDEMPOTENCY_IN_PROGRESS, isIdempotencyInProgress } from './idempotency.js';

const failure = (
  message: string,
  extra: { status?: number; code?: string; details?: unknown },
): Error => Object.assign(new Error(message), extra);

describe('isIdempotencyInProgress', () => {
  it('reads the reason the API sends with the in-progress 409', () => {
    expect(
      isIdempotencyInProgress(
        failure('anything', {
          status: 409,
          code: 'CONFLICT',
          details: { reason: IDEMPOTENCY_IN_PROGRESS },
        }),
      ),
    ).toBe(true);
    expect(
      isIdempotencyInProgress(failure('anything', { status: 409, code: IDEMPOTENCY_IN_PROGRESS })),
    ).toBe(true);
  });

  it('still accepts the message of an API without the reason (one release)', () => {
    expect(
      isIdempotencyInProgress(
        failure('A request with this Idempotency-Key is already in progress', {
          status: 409,
          code: 'CONFLICT',
        }),
      ),
    ).toBe(true);
  });

  it('is false for every other answer', () => {
    expect(isIdempotencyInProgress(undefined)).toBe(false);
    expect(isIdempotencyInProgress('already in progress')).toBe(false);
    expect(
      isIdempotencyInProgress(
        failure('This Idempotency-Key belongs to another user', { status: 409, code: 'CONFLICT' }),
      ),
    ).toBe(false);
    expect(
      isIdempotencyInProgress(
        failure('already in progress', { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }),
      ),
    ).toBe(false);
    expect(
      isIdempotencyInProgress(
        failure('nope', { status: 409, code: 'CONFLICT', details: { reason: 'OTHER' } }),
      ),
    ).toBe(false);
  });
});
