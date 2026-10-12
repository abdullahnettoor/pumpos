import { describe, expect, it } from 'vitest';
import { deriveStationAlerts } from './useStationAlerts.js';

describe('deriveStationAlerts', () => {
  it('presents over-capacity book stock as informational with reconciliation context', () => {
    const [alert] = deriveStationAlerts([
      {
        id: 'tank-1',
        name: 'Diesel Tank 1',
        productName: 'Diesel',
        capacity: 20_000,
        currentVolume: 23_800,
      },
    ]);

    expect(alert).toMatchObject({
      severity: 'info',
      title: 'Diesel Tank 1 book stock over capacity',
      actionPath: '/inventory',
      actionTab: 'tanks',
    });
    expect(alert.meta).toContain('119%');
    expect(alert.meta).toContain('Open-shift dispensed fuel');
    expect(alert.meta).toContain('reconciles when the shift closes');
  });

  it('adds days of cover to a low-stock alert, singular under a day', () => {
    const [critical, low] = deriveStationAlerts([
      {
        id: 't1',
        name: 'Tank 1',
        productName: 'Petrol',
        capacity: 10_000,
        currentVolume: 3_000,
        daysOfCover: 2.6,
      },
      {
        id: 't2',
        name: 'Tank 2',
        productName: 'Diesel',
        capacity: 10_000,
        currentVolume: 900,
        daysOfCover: 0.9,
      },
    ]);
    expect(critical.meta).toBe('Diesel · 9% · 900 L · 0.9 day of cover left');
    expect(low.meta).toBe('Petrol · 30% · 3,000 L · 2.6 days of cover left');
  });

  it('leaves the alert copy alone without sales history', () => {
    const [alert] = deriveStationAlerts([
      {
        id: 't1',
        name: 'Tank 1',
        productName: 'Petrol',
        capacity: 10_000,
        currentVolume: 3_000,
        daysOfCover: null,
      },
    ]);
    expect(alert.meta).toBe('Petrol · 30% · 3,000 L');
  });

  it('shows a pending-measurement alert alongside the low-stock alert', () => {
    const alerts = deriveStationAlerts([
      {
        id: 't1',
        name: 'Petrol Tank',
        productName: 'Petrol',
        capacity: 10_000,
        currentVolume: 900,
        waitingOnDecantation: true,
      },
    ]);

    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.title)).toEqual([
      'Petrol Tank critically low',
      'Petrol Tank waiting on decantation',
    ]);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tank-t1',
          title: 'Petrol Tank critically low',
          actionEntityId: 't1',
        }),
        expect.objectContaining({
          id: 'decantation-t1',
          title: 'Petrol Tank waiting on decantation',
          meta: 'Pending measurement',
          actionEntityId: 't1',
        }),
      ]),
    );
  });
});

describe('deriveStationAlerts — shift to-dos', () => {
  const TZ = 'Asia/Kolkata';
  // 2026-10-12 15:00 IST
  const NOW = Date.parse('2026-10-12T09:30:00.000Z');
  const shift = (over: Record<string, unknown> = {}) => ({
    openedAt: '2026-10-12T02:30:00.000Z', // 8:00 am IST
    scheduledEndTime: '14:00',
    staffAssignments: [
      { userId: 'u1', duId: 'd1' },
      { userId: 'u2', duId: 'd2' },
    ],
    handovers: [],
    ...over,
  });
  const base = { now: NOW, timeZone: TZ };

  it('asks for handovers to record while the shift is running', () => {
    const alerts = deriveStationAlerts([], [], {
      ...base,
      activeShift: shift({ scheduledEndTime: '23:00', handovers: [{ userId: 'u1', duId: 'd1' }] }),
      shiftsClosedToday: 0,
      plannedShiftCount: 1,
    });
    expect(alerts).toEqual([
      expect.objectContaining({
        id: 'handovers',
        category: 'shift',
        title: '1 handover to record',
        actionLabel: 'Open',
        actionPath: '/shifts',
      }),
    ]);
  });

  it('marks unrecorded handovers overdue past the scheduled end', () => {
    const [alert] = deriveStationAlerts([], [], {
      ...base,
      activeShift: shift(),
      shiftsClosedToday: 0,
      plannedShiftCount: 1,
    });
    expect(alert).toMatchObject({ severity: 'danger', title: '2 handovers overdue' });
  });

  it('offers Open Shift N between shifts and when no shift has opened', () => {
    const [alert] = deriveStationAlerts([], [], {
      ...base,
      activeShift: null,
      shiftsClosedToday: 1,
      plannedShiftCount: 3,
    });
    expect(alert).toMatchObject({
      id: 'open-shift',
      title: 'Open Shift 2',
      actionLabel: 'Open',
      actionPath: '/shifts',
    });
    const [first] = deriveStationAlerts([], [], {
      ...base,
      activeShift: null,
      shiftsClosedToday: 0,
      plannedShiftCount: 2,
    });
    expect(first.title).toBe('Open Shift 1');
  });

  it('offers nothing once every planned shift has closed or with no templates', () => {
    expect(
      deriveStationAlerts([], [], {
        ...base,
        activeShift: null,
        shiftsClosedToday: 2,
        plannedShiftCount: 2,
      }),
    ).toEqual([]);
    expect(
      deriveStationAlerts([], [], {
        ...base,
        activeShift: null,
        shiftsClosedToday: 0,
        plannedShiftCount: 0,
      }),
    ).toEqual([]);
  });

  it('lists unrecorded morning density without a Record action', () => {
    const [alert] = deriveStationAlerts([], [], {
      ...base,
      activeShift: null,
      shiftsClosedToday: 0,
      plannedShiftCount: 0,
      densityToday: {
        missingCount: 1,
        missingProducts: [{ productId: 'p1', productName: 'Petrol', productCode: 'PET' }],
      },
    });
    expect(alert).toMatchObject({
      id: 'density',
      category: 'density',
      title: 'Morning density not recorded',
      meta: 'Petrol',
    });
    expect(alert.actionLabel).toBeUndefined();
  });

  it('keeps stock alerts alongside shift to-dos, sorted by severity', () => {
    const alerts = deriveStationAlerts(
      [{ id: 't1', name: 'Tank 1', productName: 'Petrol', capacity: 10_000, currentVolume: 900 }],
      [],
      {
        ...base,
        activeShift: shift({ scheduledEndTime: '23:00' }),
        shiftsClosedToday: 0,
        plannedShiftCount: 1,
      },
    );
    expect(alerts.map((a) => a.id)).toEqual(['tank-t1', 'handovers']);
  });
});
