import { describe, expect, it } from 'vitest';
import { seedStaffAssignments } from './seedStaffAssignments.js';

const dus = [{ id: 'du-1' }, { id: 'du-2' }, { id: 'du-3' }];

/**
 * Nobody is preselected. That is only safe because `OpenShift` refuses a shift
 * whose in-service dispensers are not all assigned (#258) — without that
 * refusal, an unassigned dispenser could be opened into and never handed over.
 */
describe('seedStaffAssignments', () => {
  it('leaves every dispenser unassigned, so accountability is chosen not defaulted', () => {
    expect(seedStaffAssignments(dus)).toEqual([
      { duId: 'du-1', userId: '' },
      { duId: 'du-2', userId: '' },
      { duId: 'du-3', userId: '' },
    ]);
  });

  it('returns a row per dispenser so every card has state to drive it', () => {
    expect(seedStaffAssignments(dus).map((a) => a.duId)).toEqual(['du-1', 'du-2', 'du-3']);
  });

  it.each([
    ['no dispensers', [] as { id: string }[]],
    ['dispensers not loaded', null],
    ['dispensers undefined', undefined],
  ])('returns nothing for %s', (_label, dispensers) => {
    expect(seedStaffAssignments(dispensers)).toEqual([]);
  });
});
