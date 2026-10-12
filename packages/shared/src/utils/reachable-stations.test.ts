import { describe, expect, it } from 'vitest';
import { reachableStations, showStationDropdown } from './reachable-stations.js';

const s = (id: string) => ({ id, name: id });
const all = [s('a'), s('b'), s('c')];

describe('reachableStations', () => {
  it('Owner gets every station', () => {
    expect(reachableStations({ role: 'Owner', assignedStationIds: [] }, all)).toHaveLength(3);
    expect(reachableStations({ role: 'Owner', assignedStationIds: [] }, [s('a')])).toHaveLength(1);
  });
  it('Manager gets only assigned stations', () => {
    expect(reachableStations({ role: 'Manager', assignedStationIds: ['b'] }, all)).toEqual([
      s('b'),
    ]);
    expect(reachableStations({ role: 'Manager', assignedStationIds: ['a', 'c'] }, all)).toEqual([
      s('a'),
      s('c'),
    ]);
  });
  it('Accountant and Staff are scoped too', () => {
    expect(reachableStations({ role: 'Accountant', assignedStationIds: ['a'] }, all)).toEqual([
      s('a'),
    ]);
    expect(reachableStations({ role: 'Staff', assignedStationIds: [] }, all)).toEqual([]);
  });
});

describe('showStationDropdown', () => {
  it('is true only above one station', () => {
    expect(showStationDropdown([])).toBe(false);
    expect(showStationDropdown([s('a')])).toBe(false);
    expect(showStationDropdown([s('a'), s('b')])).toBe(true);
  });
});
