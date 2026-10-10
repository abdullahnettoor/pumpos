import { describe, expect, it } from 'vitest';
import { isUuid } from './is-uuid.js';

describe('isUuid', () => {
  it('accepts the uuid shape Postgres accepts, in either case', () => {
    expect(isUuid('3f0c9b6e-5a1d-4c3e-9a7b-0d2e1f4a6b8c')).toBe(true);
    expect(isUuid('3F0C9B6E-5A1D-4C3E-9A7B-0D2E1F4A6B8C')).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const bad of [
      '',
      'c-1',
      '123',
      'not-a-uuid',
      '3f0c9b6e5a1d4c3e9a7b0d2e1f4a6b8c',
      "x'; --",
    ]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
