import { describe, expect, it } from 'vitest';
import { composeDssr } from './compose.js';
import type { DssrSourceData } from './ports.js';

const drawer = (attendantId: string, variance: number | null) => ({
  attendantId,
  attendantName: attendantId.toUpperCase(),
  duId: 'du1',
  duName: 'DU-1',
  variance,
});

describe('composeDssr attendant variance (#287)', () => {
  it('reports attendant and office variance separately, per attendant', () => {
    const source = {
      shiftSummaries: [
        {
          shiftId: 's1',
          snapshot: {
            cashVariance: -100,
            attendantVariance: -200,
            drawers: [drawer('a', -200), drawer('b', 0)],
          },
        },
        { shiftId: 's2', snapshot: { cashVariance: 0, drawers: [drawer('a', 50)] } },
      ],
      purchases: [],
      sales: [],
      creditSales: [],
      stockVariances: [],
      saleItems: [],
      products: {},
      nozzles: {},
    } as unknown as DssrSourceData;
    const d = composeDssr(source) as any;
    expect(d.drawer.totalCashVariance).toBe(-100);
    expect(d.drawer.totalAttendantVariance).toBe(-150);
    expect(d.shifts.map((s: any) => s.attendantVariance)).toEqual([-200, 50]);
    expect(d.drawer.attendants).toEqual([
      { attendantId: 'a', attendantName: 'A', duName: 'DU-1', variance: -150 },
      { attendantId: 'b', attendantName: 'B', duName: 'DU-1', variance: 0 },
    ]);
  });
});
