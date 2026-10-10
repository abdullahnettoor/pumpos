import { describe, expect, it } from 'vitest';
import { keepsIdempotencyKey } from './idempotency.js';

const failure = (message: string, extra: { status?: number; code?: string }) =>
  Object.assign(new Error(message), extra);

describe('keepsIdempotencyKey', () => {
  it('keeps the key while the outcome is unknown', () => {
    expect(keepsIdempotencyKey(failure('offline', { code: 'NETWORK' }))).toBe(true);
    expect(keepsIdempotencyKey(failure('boom', { status: 503 }))).toBe(true);
    expect(
      keepsIdempotencyKey(
        failure('A request with this key is already in progress', { status: 409, code: 'CONFLICT' }),
      ),
    ).toBe(true);
  });

  it('replaces it once the answer is decided', () => {
    expect(keepsIdempotencyKey(failure('no', { status: 403 }))).toBe(false);
    expect(keepsIdempotencyKey(failure('invalid', { status: 400, code: 'VALIDATION_ERROR' }))).toBe(
      false,
    );
    expect(
      keepsIdempotencyKey(
        failure('different request content', { status: 409, code: 'CONFLICT' }),
      ),
    ).toBe(false);
  });
});
