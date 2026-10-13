// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  useTankLevelSettings: vi.fn(() => ({ criticalBelowPct: 25, lowBelowPct: 40 })),
  useShiftStatus: vi.fn(),
  useInventoryStatus: vi.fn(),
  useInventoryItems: vi.fn(),
  useReceivables: vi.fn(),
  useBusinessDayStatus: vi.fn(),
}));
vi.mock('./hooks.js', () => hooks);

import { useSidebarBadges } from './useSidebarBadges.js';

const q = (data: unknown) => ({ data });
beforeEach(() => {
  vi.clearAllMocks();
  hooks.useShiftStatus.mockReturnValue(q({ activeShift: { id: 's' } }));
  hooks.useInventoryStatus.mockReturnValue(
    q([{ id: 't', name: 'T', productName: 'D', capacity: 1000, currentVolume: 50 }]),
  );
  hooks.useInventoryItems.mockReturnValue(q([]));
  hooks.useReceivables.mockReturnValue(q({ customers: [{ oldestUnpaidDays: 45 }] }));
  hooks.useBusinessDayStatus.mockReturnValue(q({ pastOpenBusinessDays: [{}, {}] }));
});

describe('useSidebarBadges', () => {
  it('Owner gets every count from the alert derivation', () => {
    const { result } = renderHook(() => useSidebarBadges('st', true, true, '2026-10-12'));
    expect(result.current).toEqual({
      shiftRunning: true,
      inventoryAlerts: 1,
      overdueCustomers: 1,
      openPastDays: 2,
    });
  });

  it('Staff keep the Inventory badge but request no money data', () => {
    const { result } = renderHook(() => useSidebarBadges('st', true, false, '2026-10-12'));
    expect(result.current.inventoryAlerts).toBe(1);
    expect(result.current.overdueCustomers).toBe(0);
    expect(hooks.useReceivables).toHaveBeenCalledWith('st', { enabled: false });
    expect(hooks.useBusinessDayStatus).toHaveBeenCalledWith('st', '2026-10-12', { enabled: false });
  });
});
