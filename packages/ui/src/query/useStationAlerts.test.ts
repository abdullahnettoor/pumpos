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
