import { describe, expect, it } from 'vitest';
import { seedStaffAssignments } from './seedStaffAssignments.js';

const dus = [{ id: 'du-1' }, { id: 'du-2' }, { id: 'du-3' }];

/**
 * These pin a default that reads wrong on its own and is right in context:
 * assignments can only be written at shift open, so an unassigned dispenser
 * is unrecoverable while a misassigned one is one click from correct.
 */
describe('seedStaffAssignments', () => {
  it('preselects a member of staff on every dispenser', () => {
    // Not cosmetic: a dispenser left unassigned at open can never be assigned
    // afterwards, and no attendant can hand over against it.
    expect(seedStaffAssignments(dus, [{ id: 'u-1' }, { id: 'u-2' }])).toEqual([
      { duId: 'du-1', userId: 'u-1' },
      { duId: 'du-2', userId: 'u-1' },
      { duId: 'du-3', userId: 'u-1' },
    ]);
  });

  it('returns a row per dispenser so every card has state to drive it', () => {
    expect(seedStaffAssignments(dus, [{ id: 'u-1' }]).map((a) => a.duId)).toEqual([
      'du-1',
      'du-2',
      'du-3',
    ]);
  });

  it.each([
    ['no staff', [] as { id: string }[]],
    ['staff not loaded', null],
    ['staff undefined', undefined],
  ])('leaves dispensers unassigned when there is %s, rather than inventing a user', (_l, staff) => {
    expect(seedStaffAssignments(dus, staff).every((a) => a.userId === '')).toBe(true);
  });

  it.each([
    ['no dispensers', [] as { id: string }[]],
    ['dispensers not loaded', null],
  ])('returns nothing for %s', (_label, dispensers) => {
    expect(seedStaffAssignments(dispensers, [{ id: 'u-1' }])).toEqual([]);
  });
});
