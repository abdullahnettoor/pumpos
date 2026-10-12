import { describe, expect, it } from 'vitest';
import { deriveForecourt } from './derive.js';

const TZ = 'Asia/Kolkata';
// 2026-10-09 at the given IST wall time.
const ist = (hhmm: string) => Date.parse(`2026-10-09T${hhmm}:00+05:30`);

const shift = (over: Record<string, unknown> = {}) => ({
  id: 's2',
  templateName: 'Shift 2',
  openedAt: new Date(ist('14:00')).toISOString(),
  scheduledEndTime: '22:00',
  shiftTemplateId: 't2',
  staffAssignments: [
    { id: 'a1', userId: 'u1', duId: 'd1', duName: 'DU1', userName: 'Ravi', openingFloat: 2000 },
    { id: 'a2', userId: 'u2', duId: 'd2', duName: 'DU2', userName: 'Sita', openingFloat: 2000 },
    { id: 'a3', userId: 'u3', duId: 'd3', duName: 'DU3', userName: 'Vinod', openingFloat: 2000 },
  ],
  handovers: [
    {
      userId: 'u1',
      duId: 'd1',
      cashHandedOver: '41000',
      varianceAmount: '-120',
      cashDrops: '5000',
    },
  ],
  nozzleReadings: [
    { duId: 'd1', nozzleName: 'N1', productCode: 'MS' },
    { duId: 'd2', nozzleName: 'N3', productCode: 'HSD' },
  ],
  reconciliation: { openingFloat: 6000, handoverCashDrops: 5000 },
  ...over,
});

const base = { templates: [], timeZone: TZ, dayStartsAt: '06:00', summary: null };

describe('deriveForecourt live', () => {
  it('Pending before the scheduled end; recorded DUs sort last', () => {
    const m = deriveForecourt({ ...base, status: { activeShift: shift() }, now: ist('17:12') });
    if (m.kind !== 'live') throw new Error('expected live');
    expect(m.pastEnd).toBe(false);
    expect(m.elapsed).toBe('3h 12m');
    expect(m.dus.map((d) => [d.duName, d.status])).toEqual([
      ['DU2', 'pending'],
      ['DU3', 'pending'],
      ['DU1', 'recorded'],
    ]);
    expect([m.recorded, m.total, m.open, m.floats, m.drops]).toEqual([1, 3, 2, 6000, 5000]);
    expect(m.endLabel).toBe('10:00 pm');
    expect(m.dus[2]).toMatchObject({ declared: 41000, variance: -120 });
    expect(m.dus[0].fuels).toBe('N3 (HSD)');
  });

  it('Handover due once past the scheduled end', () => {
    const m = deriveForecourt({ ...base, status: { activeShift: shift() }, now: ist('22:20') });
    if (m.kind !== 'live') throw new Error('expected live');
    expect(m.pastEnd).toBe(true);
    expect(m.dus.filter((d) => d.status === 'due')).toHaveLength(2);
  });
});

describe('deriveForecourt idle', () => {
  const templates = [
    { id: 't1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true },
    { id: 't2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true },
  ];
  it('between shifts names the next window', () => {
    const m = deriveForecourt({
      ...base,
      templates,
      status: { activeShift: null },
      summary: {
        lastShift: { id: 's1', templateName: 'Shift 1' },
        lastShiftSummary: {
          totalFuelSalesValue: 216120,
          totalVolumeSold: 2211,
          cashVariance: -340,
        },
        today: {
          shifts: [
            {
              shiftTemplateId: 't1',
              openedAt: new Date(ist('06:00')).toISOString(),
              closedAt: new Date(ist('13:52')).toISOString(),
            },
          ],
        },
      },
      now: ist('14:10'),
    });
    expect(m).toMatchObject({
      kind: 'between',
      hint: 'Shift 2 is scheduled from 2:00 pm.',
      last: { sales: 216120, litres: 2211, variance: -340 },
    });
  });
  it('no shift today → No shift running with first scheduled start', () => {
    const m = deriveForecourt({
      ...base,
      templates,
      status: { activeShift: null },
      now: ist('06:20'),
    });
    expect(m).toMatchObject({
      kind: 'none',
      hint: 'Shift 1 is scheduled from 6:00 am.',
      last: null,
    });
  });
});
