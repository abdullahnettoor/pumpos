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
});
