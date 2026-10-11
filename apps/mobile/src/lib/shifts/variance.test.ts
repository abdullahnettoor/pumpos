import { describe, expect, it } from 'vitest';
import { deriveShiftVariance } from './variance.js';

const drawers = [
  { duName: 'DU1', attendantName: 'Ramesh', variance: 0 },
  { duName: 'DU3', attendantName: 'Vinod', variance: -340 },
];

describe('deriveShiftVariance', () => {
  it('headlines the attendant level and names the DU that is short', () => {
    const v = deriveShiftVariance({
      cashVarianceModel: 2,
      attendantVariance: -340,
      officeCountVariance: 0,
      cashVariance: 0,
      drawers,
    });
    expect(v).toMatchObject({ twoLevel: true, attendant: -340, office: 0, headline: -340 });
    expect(v.headlineNote).toBe('DU3 short');
  });

  it('falls back to the office count when every Drawer is balanced', () => {
    const v = deriveShiftVariance({
      cashVarianceModel: 2,
      attendantVariance: 0,
      officeCountVariance: 120,
      drawers: [{ duName: 'DU1', variance: 0 }],
    });
    expect(v.headline).toBe(120);
    expect(v.headlineNote).toBe('Office count');
  });

  it('reads Balanced when both levels are zero', () => {
    const v = deriveShiftVariance({ cashVarianceModel: 2, attendantVariance: 0, cashVariance: 0 });
    expect(v.headline).toBe(0);
    expect(v.headlineNote).toBe('Balanced');
  });

  it('keeps a single level for a snapshot closed before #287', () => {
    const v = deriveShiftVariance({ cashVariance: -80, drawers });
    expect(v).toMatchObject({ twoLevel: false, attendant: null, office: -80, headline: -80 });
    expect(v.headlineNote).toBe('DU3 short');
  });

  it('tolerates a snapshot with nothing in it', () => {
    expect(deriveShiftVariance({}).headline).toBe(0);
  });

  it('treats sub-paisa noise as balanced', () => {
    expect(deriveShiftVariance({ cashVariance: 0.001 }).headlineNote).toBe('Balanced');
  });
});
