import { describe, expect, it } from 'vitest';
import { OfficeSubmitKeys } from './submitKeys.js';

const network = Object.assign(new Error('offline'), { code: 'NETWORK' });
const refused = Object.assign(new Error('nope'), { status: 403, code: 'FORBIDDEN' });
const keyConflict = Object.assign(
  new Error('This Idempotency-Key was already used with different request content'),
  { status: 409, code: 'CONFLICT' },
);

const counter = () => {
  let n = 0;
  return () => `key-${++n}`;
};

describe('OfficeSubmitKeys: one Idempotency-Key per logical submit', () => {
  it('keeps the key after an unknown outcome, even if the operator edits before retrying', () => {
    const keys = new OfficeSubmitKeys(counter());
    const session = keys.session('expense:s1');
    const first = session.next('{"amount":100}');
    session.settle(network);
    expect(session.next('{"amount":120}')).toBe(first);
  });

  it('keeps the key when an edited retry is refused as a key conflict', () => {
    const keys = new OfficeSubmitKeys(counter());
    const session = keys.session('expense:s1');
    const first = session.next('{"amount":100}');
    session.settle(network);
    expect(session.next('{"amount":120}')).toBe(first);
    session.settle(keyConflict);
    // The first save may have landed: a fresh key here could record it twice.
    expect(session.next('{"amount":120}')).toBe(first);
    expect(keys.session('expense:s1').next('{"amount":120}')).toBe(first);
  });

  it('renews the key after a save and after a decided refusal', () => {
    const keys = new OfficeSubmitKeys(counter());
    const session = keys.session('expense:s1');
    const a = session.next('{}');
    session.settle(refused);
    const b = session.next('{}');
    session.settle();
    const c = session.next('{}');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('reuses an unsettled key in a new drawer only for the same record', () => {
    const keys = new OfficeSubmitKeys(counter());
    const first = keys.session('expense:s1');
    const k = first.next('{"amount":100}');
    first.settle(network);

    expect(keys.session('expense:s1').next('{"amount":100}')).toBe(k);
    expect(keys.session('expense:s1').next('{"amount":999}')).not.toBe(k);
    expect(keys.session('income:s1').next('{"amount":100}')).not.toBe(k);
  });
});
