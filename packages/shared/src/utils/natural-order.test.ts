import { describe, expect, it } from 'vitest';
import { byNaturalField, compareNatural } from './natural-order.js';

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
