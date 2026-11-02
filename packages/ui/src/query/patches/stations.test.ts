import { describe, expect, it } from 'vite-plus/test';
import type { Station } from '@pump/shared';
import { withSavedStation } from './stations.js';

const station = (id: string, name: string): Station => ({
  id,
  organizationId: 'org-1',
  name,
  code: id,
  address: null,
  phone: null,
  settings: {
    shift_grace_minutes: 15,
    shift_lock_grace_days: 3,
    offline_warning_days: 3,
    offline_critical_days: 7,
  },
  onboardingStatus: 'READY_FOR_OPERATIONS',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('withSavedStation', () => {
  it('replaces only the matching Station with the accepted response', () => {
    const first = station('st-1', 'First');
    const second = station('st-2', 'Second');
    const saved = { ...first, settings: { ...first.settings, stock_variance_tolerance_pct: 1 } };
    const list = [first, second];

    const result = withSavedStation(list, saved);
    expect(result).toEqual([saved, second]);
    expect(result?.[0]).toBe(saved);
    expect(result?.[1]).toBe(second);
    expect(list[0]).toBe(first);
  });

  it('leaves absent or unmatched lists unchanged', () => {
    const saved = station('st-1', 'Saved');
    const list = [station('st-2', 'Other')];
    expect(withSavedStation(undefined, saved)).toBeUndefined();
    expect(withSavedStation(list, saved)).toBe(list);
  });
});
