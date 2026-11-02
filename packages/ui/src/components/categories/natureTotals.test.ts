import { describe, expect, it } from 'vite-plus/test';
import { splitByNature } from './natureTotals.js';

describe('splitByNature', () => {
  it('totals Direct, Indirect and Grand over the entries', () => {
    expect(
      splitByNature([
        { amount: '1000.50', categoryNature: 'DIRECT' },
        { amount: 250, categoryNature: 'INDIRECT' },
        { amount: '49.50', categoryNature: 'DIRECT' },
      ]),
    ).toEqual({ direct: 1050, indirect: 250, grand: 1300 });
  });

  it('counts an entry whose head has no Type as Indirect', () => {
    expect(
      splitByNature([
        { amount: 100, categoryNature: null },
        { amount: 40, categoryNature: undefined },
      ]),
    ).toEqual({ direct: 0, indirect: 140, grand: 140 });
  });

  it('leaves out voided entries', () => {
    expect(
      splitByNature([
        { amount: 500, categoryNature: 'DIRECT', status: 'VOIDED' },
        { amount: 70, categoryNature: 'DIRECT', status: 'RECORDED' },
      ]),
    ).toEqual({ direct: 70, indirect: 0, grand: 70 });
  });

  it('is zero for no entries', () => {
    expect(splitByNature([])).toEqual({ direct: 0, indirect: 0, grand: 0 });
  });

  it('moves an entry to the other total when its head is re-classified', () => {
    const entries = [{ amount: 300, categoryNature: 'DIRECT' as const }];
    expect(splitByNature(entries).direct).toBe(300);
    expect(splitByNature([{ ...entries[0], categoryNature: 'INDIRECT' }])).toEqual({
      direct: 0,
      indirect: 300,
      grand: 300,
    });
  });
});
