import { describe, expect, it } from 'vitest';
import { suppliersAtStation } from './station-scope.js';

const HIGHWAY = 'st-highway';
const CITY = 'st-city';
const bpcl = { id: 'bpcl', stationId: HIGHWAY };
const iocl = { id: 'iocl', stationId: CITY };
const lube = { id: 'lube', stationId: null };

describe('suppliersAtStation', () => {
  it("shows the Station's own suppliers and shared ones, never another Station's", () => {
    const shown = suppliersAtStation([bpcl, iocl, lube], HIGHWAY, new Set());
    expect(shown.map((s) => s.id)).toEqual(['bpcl', 'lube']);
  });

  it("keeps another Station's supplier this Station has ledger entries with", () => {
    const shown = suppliersAtStation([bpcl, iocl, lube], HIGHWAY, new Set(['iocl']));
    expect(shown.map((s) => s.id)).toEqual(['bpcl', 'iocl', 'lube']);
  });

  it('shows the other Station its own side', () => {
    const shown = suppliersAtStation([bpcl, iocl, lube], CITY, new Set());
    expect(shown.map((s) => s.id)).toEqual(['iocl', 'lube']);
  });
});
