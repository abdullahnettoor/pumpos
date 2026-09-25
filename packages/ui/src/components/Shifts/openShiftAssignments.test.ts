import { describe, expect, it } from 'vitest';
import { buildOpenShiftAssignments } from './openShiftAssignments.js';

/**
 * #223 restructured how assignments are entered, not what is sent. These pin
 * the mapping that claim rests on — it was previously inline in the submit
 * handler of a 1200-line container with no test anywhere near it.
 */
describe('buildOpenShiftAssignments', () => {
  it('sends an assigned dispenser', () => {
    expect(
      buildOpenShiftAssignments([{ duId: 'du-1', userId: 'u-1' }], []).staffAssignments,
    ).toEqual([{ duId: 'du-1', userId: 'u-1', openingFloat: 0 }]);
  });

  it('drops an unassigned dispenser rather than sending an empty user', () => {
    // `OpenShift`'s schema requires a non-empty userId, so an empty row would
    // fail validation for the whole command.
    expect(
      buildOpenShiftAssignments(
        [
          { duId: 'du-1', userId: 'u-1' },
          { duId: 'du-2', userId: '' },
        ],
        [],
      ).staffAssignments,
    ).toEqual([{ duId: 'du-1', userId: 'u-1', openingFloat: 0 }]);
  });

  it("sends each Drawer's Opening Float (ADR 0005)", () => {
    expect(
      buildOpenShiftAssignments([{ duId: 'du-1', userId: 'u-1', openingFloat: 500 }], [])
        .staffAssignments,
    ).toEqual([{ duId: 'du-1', userId: 'u-1', openingFloat: 500 }]);
  });

  it('lets one attendant hold more than one dispenser', () => {
    expect(
      buildOpenShiftAssignments(
        [
          { duId: 'du-1', userId: 'u-1' },
          { duId: 'du-2', userId: 'u-1' },
        ],
        [],
      ).staffAssignments,
    ).toHaveLength(2);
  });

  it('spells a shift-wide terminal as a null dispenser, not an empty string', () => {
    expect(buildOpenShiftAssignments([], [{ terminalId: 't-1', duId: '' }]).terminalLinks).toEqual([
      { terminalId: 't-1', duId: null },
    ]);
  });

  it('keeps a shift-wide terminal in the payload rather than dropping it', () => {
    // A null link is declarable from any dispenser at handover. Dropping it
    // would hide a shared POS from every attendant.
    expect(
      buildOpenShiftAssignments([], [{ terminalId: 't-1', duId: '' }]).terminalLinks,
    ).toHaveLength(1);
  });

  it('links more than one terminal to a single dispenser', () => {
    expect(
      buildOpenShiftAssignments(
        [],
        [
          { terminalId: 't-1', duId: 'du-1' },
          { terminalId: 't-2', duId: 'du-1' },
        ],
      ).terminalLinks,
    ).toEqual([
      { terminalId: 't-1', duId: 'du-1' },
      { terminalId: 't-2', duId: 'du-1' },
    ]);
  });

  it('sends nothing for a station with neither', () => {
    expect(buildOpenShiftAssignments([], [])).toEqual({
      staffAssignments: [],
      terminalLinks: [],
    });
  });
});
