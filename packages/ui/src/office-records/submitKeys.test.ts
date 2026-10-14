import { describe, expect, it } from 'vitest';
import { MAX_HELD_KEYS_PER_SCOPE, OfficeSubmitKeys } from './submitKeys.js';

const network = Object.assign(new Error('offline'), { code: 'NETWORK' });
const refused = Object.assign(new Error('nope'), { status: 403, code: 'FORBIDDEN' });
const keyConflict = Object.assign(
  new Error('This Idempotency-Key was already used with different request content'),
  { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
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
    // A new drawer reuses it for the body the server holds.
    expect(keys.session('expense:s1').next('{"amount":100}')).toBe(first);
  });

  it('gives the corrected record a fresh key in a new drawer after a key conflict', () => {
    const keys = new OfficeSubmitKeys(counter());
    const session = keys.session('expense:s1');
    const first = session.next('{"amount":100}');
    session.settle(network);
    session.next('{"amount":120}');
    session.settle(keyConflict);

    // Close and start again: the server refused 120 under this key, so it
    // holds 100. Re-entering 120 must not hit the same refusal.
    const corrected = keys.session('expense:s1');
    const fresh = corrected.next('{"amount":120}');
    expect(fresh).not.toBe(first);
    corrected.settle();
    // Re-entering the first record still reuses its key: it cannot land twice.
    expect(keys.session('expense:s1').next('{"amount":100}')).toBe(first);
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

describe('OfficeSubmitKeys: every unanswered key in a scope is kept (#564)', () => {
  const A = '{"amount":100}';
  const B = '{"amount":120}';
  const C = '{"amount":500}';

  it('A unanswered, then C unanswered, then A again reuses A’s key', () => {
    const keys = new OfficeSubmitKeys(counter());
    const a = keys.session('expense:s1');
    const k1 = a.next(A);
    a.settle(network);
    const c = keys.session('expense:s1');
    const k2 = c.next(C);
    c.settle(network);

    expect(keys.session('expense:s1').next(A)).toBe(k1);
    expect(keys.session('expense:s1').next(C)).toBe(k2);
  });

  it('two drawers open at once keep their own keys, and one saving does not clear the other’s', () => {
    const keys = new OfficeSubmitKeys(counter());
    const page = keys.session('expense:s1');
    const menu = keys.session('expense:s1');
    const k1 = page.next(A);
    const k2 = menu.next(C);
    expect(k2).not.toBe(k1);
    page.settle(network);
    menu.settle(network);

    // The New-menu drawer retries and saves: only its own key is cleared.
    expect(menu.next(C)).toBe(k2);
    menu.settle();
    expect(keys.session('expense:s1').next(A)).toBe(k1);
    expect(keys.session('expense:s1').next(C)).not.toBe(k2);
  });

  it('a save clears only its own key, in either order', () => {
    const keys = new OfficeSubmitKeys(counter());
    const first = keys.session('expense:s1');
    const k1 = first.next(A);
    first.settle(network);
    const second = keys.session('expense:s1');
    const k2 = second.next(C);
    second.settle(network);

    first.next(A);
    first.settle();
    expect(keys.session('expense:s1').next(C)).toBe(k2);
    expect(keys.session('expense:s1').next(A)).not.toBe(k1);
  });

  it('a decided refusal clears only its own key', () => {
    const keys = new OfficeSubmitKeys(counter());
    const first = keys.session('expense:s1');
    const k1 = first.next(A);
    first.settle(network);
    const second = keys.session('expense:s1');
    const k2 = second.next(C);
    second.settle(network);

    second.next(C);
    second.settle(refused);
    expect(keys.session('expense:s1').next(A)).toBe(k1);
    expect(keys.session('expense:s1').next(C)).not.toBe(k2);
  });

  it('holds two bodies under one key, drops each refused one, and holds again after emptying', () => {
    const keys = new OfficeSubmitKeys(counter());
    const drawer = keys.session('expense:s1');
    const k = drawer.next(A);
    drawer.settle(network);
    drawer.next(B);
    drawer.settle(network);

    // Either body may be what the server holds.
    expect(keys.session('expense:s1').next(A)).toBe(k);
    expect(keys.session('expense:s1').next(B)).toBe(k);

    // The server refuses B under the key: it holds A, not B.
    drawer.next(B);
    drawer.settle(keyConflict);
    expect(keys.session('expense:s1').next(B)).not.toBe(k);
    expect(keys.session('expense:s1').next(A)).toBe(k);

    // A refused too: nothing left for a new drawer to reuse the key for.
    drawer.next(A);
    drawer.settle(keyConflict);
    expect(keys.session('expense:s1').next(A)).not.toBe(k);

    // The drawer still keeps its key, and holds it again once a send is unanswered.
    expect(drawer.next(C)).toBe(k);
    drawer.settle(network);
    expect(keys.session('expense:s1').next(C)).toBe(k);
  });

  it('keeps a soft cap of held keys per scope, dropping the oldest', () => {
    const keys = new OfficeSubmitKeys(counter());
    const sent: string[] = [];
    for (let i = 0; i <= MAX_HELD_KEYS_PER_SCOPE; i += 1) {
      const s = keys.session('expense:s1');
      sent.push(s.next(`{"n":${i}}`));
      s.settle(network);
    }
    expect(keys.session('expense:s1').next('{"n":0}')).not.toBe(sent[0]);
    expect(keys.session('expense:s1').next('{"n":1}')).toBe(sent[1]);
    expect(keys.session('expense:s1').next(`{"n":${MAX_HELD_KEYS_PER_SCOPE}}`)).toBe(
      sent[MAX_HELD_KEYS_PER_SCOPE],
    );
    // Another scope has its own cap.
    const other = keys.session('income:s1');
    const o = other.next('{"n":0}');
    other.settle(network);
    expect(keys.session('income:s1').next('{"n":0}')).toBe(o);
  });
});
