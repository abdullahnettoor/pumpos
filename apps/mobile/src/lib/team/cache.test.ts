import { describe, expect, it } from 'vitest';
import { addMember, memberRow, patchMember } from './cache.js';

describe('memberRow', () => {
  it('keeps list fields and never the auth linkage', () => {
    expect(
      memberRow({
        id: 'u',
        fullName: 'A',
        role: 'Staff',
        authUserId: 'secret',
        organizationId: 'o',
      }),
    ).toEqual({ id: 'u', fullName: 'A', role: 'Staff' });
    expect(memberRow(undefined)).toEqual({});
  });
});

describe('patchMember', () => {
  it('patches one member and leaves the rest', () => {
    const list = [
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'ACTIVE' },
    ];
    expect(patchMember(list, 'b', { status: 'INACTIVE' })).toEqual([
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'INACTIVE' },
    ]);
  });
  it('leaves an unloaded list unloaded', () => {
    expect(patchMember(undefined, 'a', {})).toBeUndefined();
  });
});

describe('addMember', () => {
  it('appends once', () => {
    const one = addMember([{ id: 'a' }], { id: 'b' });
    expect(one).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(addMember(one, { id: 'b' })).toHaveLength(2);
  });
});
