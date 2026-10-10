import { describe, expect, it } from 'vitest';
import { activeMembers, onShiftNames } from './team.js';

describe('activeMembers', () => {
  it('drops deactivated users and tolerates no data', () => {
    const users = [{ id: 'a', status: 'ACTIVE' }, { id: 'b', status: 'INACTIVE' }, { id: 'c' }];
    expect(activeMembers(users).map((u) => u.id)).toEqual(['a', 'c']);
    expect(activeMembers(undefined)).toEqual([]);
  });
});

describe('onShiftNames', () => {
  it('lists each person once, in order, skipping unnamed rows', () => {
    expect(
      onShiftNames([
        { userName: 'Ramesh K' },
        { userName: 'Sajid P' },
        { userName: 'Ramesh K' },
        { userName: null },
        {},
      ]),
    ).toEqual(['Ramesh K', 'Sajid P']);
    expect(onShiftNames(undefined)).toEqual([]);
  });
});
