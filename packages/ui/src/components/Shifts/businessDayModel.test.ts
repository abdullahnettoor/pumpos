import { describe, expect, it } from 'vite-plus/test';
import { dayFigures, dayShifts } from './businessDayModel.js';

const snap = {
  businessDate: '2026-10-14',
  shiftsIncluded: 2,
  fuel: { totalNetVolume: '5480.25' },
  pnl: {
    revenue: 541880.1,
    revenueFuel: 535210.1,
    revenueMerch: 6670,
    cogs: 512300,
    grossMargin: 29580.1,
  },
  credit: { total: 38400, normalCredit: 30400, fleetCredit: 8000 },
  purchases: { total: 18400 },
  merchandise: { salesValue: 6670 },
  drawer: { totalAttendantVariance: -350, totalCashVariance: '-120' },
  shifts: [
    {
      shiftId: 's1',
      templateName: 'Morning',
      shiftSequence: 1,
      closedAt: '2026-10-14T08:30:00Z',
      netVolume: 1800,
      expectedDrawerCash: 61240,
      cashVariance: 0,
    },
    {
      shiftId: 's2',
      templateName: null,
      shiftSequence: 2,
      closedAt: '2026-10-14T16:30:00Z',
      netVolume: '1900.5',
      expectedDrawerCash: 58240,
      cashVariance: -120,
    },
  ],
};

describe('dayFigures', () => {
  it('reads the day tiles from a DSR', () => {
    expect(dayFigures(snap)).toMatchObject({
      shiftsIncluded: 2,
      netVolume: 5480.25,
      revenue: 541880.1,
      revenueProducts: 6670,
      creditTotal: 38400,
      grossMargin: 29580.1,
      attendantVariance: -350,
      officeVariance: -120,
    });
  });

  it('reads an empty day as zeros, with no variance', () => {
    expect(dayFigures(null)).toMatchObject({ revenue: 0, attendantVariance: null });
  });
});

describe('dayShifts', () => {
  it('lists the closed shifts with their readable names', () => {
    const d = dayShifts({ snap, businessDate: '2026-10-14' });
    expect(d.rows.map((r) => [r.label, r.template, r.netVolume, r.variance])).toEqual([
      ['20261014-1', 'Morning', 1800, 0],
      ['20261014-2', 'Custom', 1900.5, -120],
    ]);
    expect(d.openCount).toBe(0);
  });

  it('puts the open shift first when the DSR does not list it', () => {
    const d = dayShifts({
      snap,
      businessDate: '2026-10-14',
      openShift: { id: 's3', templateName: 'Night', shiftSequence: 3 },
    });
    expect(d.rows[0]).toMatchObject({
      shiftId: 's3',
      label: '20261014-3',
      closedAt: null,
      netVolume: null,
    });
    expect(d.openCount).toBe(1);
  });
});
