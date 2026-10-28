import { describe, expect, it } from 'vite-plus/test';
import { IDEMPOTENCY_IN_PROGRESS } from '@pump/shared';
import { isIdempotencyKeyConflict, keepsIdempotencyKey } from './idempotency.js';

const failure = (message: string, extra: { status?: number; code?: string }) =>
  Object.assign(new Error(message), extra);

describe('keepsIdempotencyKey', () => {
  it('keeps the key while the outcome is unknown', () => {
    expect(keepsIdempotencyKey(failure('offline', { code: 'NETWORK' }))).toBe(true);
    expect(keepsIdempotencyKey(failure('boom', { status: 503 }))).toBe(true);
    expect(
      keepsIdempotencyKey(
        failure('A request with this key is already in progress', {
          status: 409,
          code: 'CONFLICT',
        }),
      ),
    ).toBe(true);
  });

  it('reads the in-progress reason, not the message', () => {
    expect(
      keepsIdempotencyKey(
        Object.assign(failure('Busy', { status: 409, code: 'CONFLICT' }), {
          details: { reason: IDEMPOTENCY_IN_PROGRESS },
        }),
      ),
    ).toBe(true);
    expect(
      keepsIdempotencyKey(
        failure('This Idempotency-Key belongs to another user', { status: 409, code: 'CONFLICT' }),
      ),
    ).toBe(false);
  });

  it('replaces it once the answer is decided', () => {
    expect(keepsIdempotencyKey(failure('no', { status: 403 }))).toBe(false);
    expect(keepsIdempotencyKey(failure('invalid', { status: 400, code: 'VALIDATION_ERROR' }))).toBe(
      false,
    );
    expect(
      keepsIdempotencyKey(
        failure('different request content', { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }),
      ),
    ).toBe(false);
  });
});

describe('isIdempotencyKeyConflict', () => {
  it('reads the dedicated code, not the message', () => {
    expect(
      isIdempotencyKeyConflict(
        failure('anything', { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }),
      ),
    ).toBe(true);
    expect(
      isIdempotencyKeyConflict(
        failure('This Idempotency-Key was already used with different request content', {
          status: 409,
          code: 'CONFLICT',
        }),
      ),
    ).toBe(false);
  });
});
