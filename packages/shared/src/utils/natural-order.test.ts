import { describe, expect, it } from 'vitest';
import { byNaturalField, compareByDispenserThenNozzle, compareNatural } from './natural-order.js';

describe('compareNatural', () => {
  it('orders nozzle labels the way an operator reads them', () => {
    const names = ['N10', 'N2', 'N1', 'N11', 'N3'];
    expect([...names].sort(compareNatural)).toEqual(['N1', 'N2', 'N3', 'N10', 'N11']);
  });

  it('is not fooled by lexicographic order, which files N10 before N2', () => {
    expect(compareNatural('N2', 'N10')).toBeLessThan(0);
    expect('N2'.localeCompare('N10')).toBeGreaterThan(0);
  });

  it('orders dispenser codes with separators and zero padding alike', () => {
    expect(['DU-10', 'DU-2', 'DU-1'].sort(compareNatural)).toEqual(['DU-1', 'DU-2', 'DU-10']);
    expect(['DU-010', 'DU-002'].sort(compareNatural)).toEqual(['DU-002', 'DU-010']);
  });

  it('ignores case so a renamed nozzle does not jump the list', () => {
    expect(compareNatural('n2', 'N10')).toBeLessThan(0);
  });

  it('sorts unnamed rows last instead of colliding at the top', () => {
    expect([null, 'N2', undefined, 'N1'].sort(compareNatural)).toEqual([
      'N1',
      'N2',
      null,
      undefined,
    ]);
  });

  it('is a total order: equal labels compare equal', () => {
    expect(compareNatural('N1', 'N1')).toBe(0);
    expect(compareNatural(null, undefined)).toBe(0);
  });

  it('sorts records by a named field', () => {
    const rows = [{ nozzleName: 'N10' }, { nozzleName: 'N2' }];
    expect(rows.sort(byNaturalField((r) => r.nozzleName)).map((r) => r.nozzleName)).toEqual([
      'N2',
      'N10',
    ]);
  });
});

/**
 * The composite rule — dispenser first, then nozzle — was written out three
 * times in three shapes (route, readings grid, open-shift form), so the three
 * surfaces could silently disagree about the order of the same hardware.
 */
describe('compareByDispenserThenNozzle', () => {
  const order = (rows: { du: string | null; nozzle: string }[]): string[] =>
    [...rows]
      .sort(
        compareByDispenserThenNozzle(
          (r) => r.du,
          (r) => r.nozzle,
        ),
      )
      .map((r) => `${r.du}/${r.nozzle}`);

  it('groups by dispenser before it looks at the nozzle', () => {
    expect(
      order([
        { du: 'DU-2', nozzle: 'N1' },
        { du: 'DU-1', nozzle: 'N2' },
        { du: 'DU-1', nozzle: 'N1' },
      ]),
    ).toEqual(['DU-1/N1', 'DU-1/N2', 'DU-2/N1']);
  });

  it('orders both levels naturally, so N10 follows N2 inside DU-10', () => {
    expect(
      order([
        { du: 'DU-10', nozzle: 'N10' },
        { du: 'DU-10', nozzle: 'N2' },
        { du: 'DU-2', nozzle: 'N1' },
      ]),
    ).toEqual(['DU-2/N1', 'DU-10/N2', 'DU-10/N10']);
  });

  it('falls through to the nozzle only when the dispensers tie', () => {
    const cmp = compareByDispenserThenNozzle(
      (r: { du: string; nozzle: string }) => r.du,
      (r) => r.nozzle,
    );
    expect(cmp({ du: 'DU-1', nozzle: 'N9' }, { du: 'DU-2', nozzle: 'N1' })).toBeLessThan(0);
    expect(cmp({ du: 'DU-1', nozzle: 'N1' }, { du: 'DU-1', nozzle: 'N2' })).toBeLessThan(0);
    expect(cmp({ du: 'DU-1', nozzle: 'N1' }, { du: 'DU-1', nozzle: 'N1' })).toBe(0);
  });

  it('sorts a dispenser-less row last without disturbing the rest', () => {
    expect(
      order([
        { du: null, nozzle: 'N1' },
        { du: 'DU-2', nozzle: 'N1' },
        { du: 'DU-1', nozzle: 'N1' },
      ]),
    ).toEqual(['DU-1/N1', 'DU-2/N1', 'null/N1']);
  });

  /**
   * #241 moved two UI surfaces onto the shared comparator, which quietly made
   * them case-insensitive. That is right for hardware labels — `n2` and `N2`
   * are the same nozzle, and a rename must not make a row jump the list — but
   * it was an untested behaviour delta. Held deliberately here.
   */
  describe('case, which #241 changed on two surfaces without a test', () => {
    it('treats a lower-cased nozzle as the same label for ordering', () => {
      expect(
        order([
          { du: 'du-1', nozzle: 'n10' },
          { du: 'DU-1', nozzle: 'N2' },
        ]),
      ).toEqual(['DU-1/N2', 'du-1/n10']);
    });

    it('does not let case alone decide the order', () => {
      const cmp = compareByDispenserThenNozzle(
        (r: { du: string; nozzle: string }) => r.du,
        (r) => r.nozzle,
      );
      expect(cmp({ du: 'du-1', nozzle: 'n1' }, { du: 'DU-1', nozzle: 'N1' })).toBe(0);
    });
  });
});
