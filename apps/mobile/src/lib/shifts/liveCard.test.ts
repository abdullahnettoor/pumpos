import { describe, expect, it } from 'vitest';
import { deriveLiveShiftCard, isHandoverDue } from './liveCard.js';

const tz = 'Asia/Kolkata';
// 2026-10-09 08:30Z = 2:00 pm IST
const opened = '2026-10-09T08:30:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('isHandoverDue', () => {
  it('is due once the Shift runs past its scheduled end', () => {
    // Template 2 pm – 10 pm; 10 pm IST = 16:30Z
    expect(isHandoverDue(opened, at('2026-10-09T16:29:00Z'), '22:00', tz)).toBe(false);
    expect(isHandoverDue(opened, at('2026-10-09T16:30:00Z'), '22:00', tz)).toBe(true);
  });

  it('ends a night Shift on the next morning', () => {
    const night = '2026-10-09T16:30:00.000Z'; // 10 pm IST
    expect(isHandoverDue(night, at('2026-10-09T20:00:00Z'), '06:00', tz)).toBe(false);
    expect(isHandoverDue(night, at('2026-10-10T00:30:00Z'), '06:00', tz)).toBe(true);
  });

  it('is never due without a schedule', () => {
    expect(isHandoverDue(opened, at('2026-10-12T00:00:00Z'), undefined, tz)).toBe(false);
  });
});

const status = (over: Record<string, unknown> = {}) => ({
  activeShift: {
    id: 's2',
    templateName: 'Shift 2',
    businessDate: '2026-10-09',
    openedAt: opened,
    openedByName: 'Abdullah',
    scheduledEndTime: '22:00',
    nozzleReadings: [{}, {}, {}, {}, {}, {}],
    reconciliation: { openingFloat: 6000, handoverCashDrops: 30000 },
    staffAssignments: [
      {
        id: 'a1',
        userId: 'u1',
        duId: 'd1',
        userName: 'Ramesh K',
        duName: 'DU1',
        openingFloat: 2000,
      },
      {
        id: 'a2',
        userId: 'u2',
        duId: 'd2',
        userName: 'Sajid P',
        duName: 'DU2',
        openingFloat: 2000,
      },
      {
        id: 'a3',
        userId: 'u3',
        duId: 'd3',
        userName: 'Vinod M',
        duName: 'DU3',
        openingFloat: 2000,
      },
    ],
    handovers: [{ userId: 'u2', duId: 'd2', cashHandedOver: '21480', varianceAmount: '0.00' }],
    ...over,
  },
});

describe('deriveLiveShiftCard', () => {
  it('has nothing without an open Shift', () => {
    expect(deriveLiveShiftCard({ activeShift: null }, at('2026-10-09T09:00:00Z'), tz)).toBeNull();
    expect(deriveLiveShiftCard(null, 0, tz)).toBeNull();
  });

  it('reads the header figures from the server totals', () => {
    const card = deriveLiveShiftCard(status(), at('2026-10-09T11:42:00Z'), tz)!;
    expect(card).toMatchObject({
      name: 'Shift 2',
      businessDateLabel: 'Fri, 9 Oct',
      since: 'since 2:00 pm',
      elapsed: '3h 12m',
      openedBy: 'Abdullah',
      openingFloats: 6000,
      cashDrops: 30000,
      nozzles: 6,
      recorded: 1,
      total: 3,
    });
  });

  it('marks each DU Pending, Recorded or Handover due', () => {
    const before = deriveLiveShiftCard(status(), at('2026-10-09T11:42:00Z'), tz)!;
    expect(before.dus.map((d) => d.status)).toEqual(['pending', 'recorded', 'pending']);
    const after = deriveLiveShiftCard(status(), at('2026-10-09T17:00:00Z'), tz)!;
    expect(after.dus.map((d) => d.status)).toEqual(['due', 'recorded', 'due']);
  });

  it('carries the declared cash and the server variance on a recorded row', () => {
    const card = deriveLiveShiftCard(status(), at('2026-10-09T11:42:00Z'), tz)!;
    expect(card.dus[1]).toMatchObject({ attendant: 'Sajid P', declared: 21480, variance: 0 });
    expect(card.dus[0]).toMatchObject({ declared: null, variance: null });
  });

  it('falls back to the assignment floats when the reconciliation is missing', () => {
    const card = deriveLiveShiftCard(
      status({ reconciliation: undefined }),
      at('2026-10-09T11:42:00Z'),
      tz,
    )!;
    expect(card.openingFloats).toBe(6000);
    expect(card.cashDrops).toBe(0);
  });
});
