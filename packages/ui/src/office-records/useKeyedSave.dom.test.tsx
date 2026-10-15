// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useKeyedSave } from './useKeyedSave.js';

afterEach(cleanup);

const network = Object.assign(new Error('offline'), { code: 'NETWORK' });
const refused = Object.assign(new Error('nope'), { status: 400, code: 'BAD' });

/** A fresh mount of a form under `scope`, as a newly opened drawer. */
const mount = (scope: string) => renderHook(() => useKeyedSave(scope)).result.current;
const keyOf = async (save: ReturnType<typeof mount>, body: unknown, fail?: Error) => {
  let key = '';
  await save(body, async (k) => {
    key = k;
    if (fail) throw fail;
  }).catch(() => undefined);
  return key;
};

describe('useKeyedSave: one session per opened form (#538)', () => {
  it('keeps the key for a retry in the same form after an unknown outcome', async () => {
    const save = mount('t:retry');
    const first = await keyOf(save, { a: 1 }, network);
    expect(await keyOf(save, { a: 1 })).toBe(first);
  });

  it('renews the key after a save or a decided refusal', async () => {
    const save = mount('t:renew');
    const a = await keyOf(save, { a: 1 });
    const b = await keyOf(save, { a: 1 }, refused);
    expect(b).not.toBe(a);
    expect(await keyOf(save, { a: 1 })).not.toBe(b);
  });

  it('a new form gets a new key for another body and recovers it for the same body', async () => {
    const lost = await keyOf(mount('t:new'), { name: 'A' }, network);
    expect(await keyOf(mount('t:new'), { name: 'B' })).not.toBe(lost);
    expect(await keyOf(mount('t:new'), { name: 'A' })).toBe(lost);
  });

  it('never shares a key across scopes', async () => {
    const lost = await keyOf(mount('t:one'), { a: 1 }, network);
    expect(await keyOf(mount('t:two'), { a: 1 })).not.toBe(lost);
  });
});
