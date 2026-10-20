import { describe, expect, it } from 'vite-plus/test';
import { keyForBody, newSaveKey, resetSaveKey } from './saveKey.js';

describe('keyForBody', () => {
  it('reuses the key for an unchanged retry', () => {
    const s = newSaveKey();
    const first = keyForBody(s, { a: 1 });
    expect(keyForBody(s, { a: 1 })).toBe(first);
  });

  it('renews the key when the form changed after a failed attempt', () => {
    const s = newSaveKey();
    const first = keyForBody(s, { a: 1 });
    expect(keyForBody(s, { a: 2 })).not.toBe(first);
  });

  it('starts a new request after a reset', () => {
    const s = newSaveKey();
    const first = keyForBody(s, { a: 1 });
    resetSaveKey(s);
    expect(keyForBody(s, { a: 1 })).not.toBe(first);
  });
});
