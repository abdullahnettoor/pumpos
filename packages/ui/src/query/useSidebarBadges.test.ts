import { describe, expect, it } from 'vitest';
import { countOverdueCustomers } from './useSidebarBadges.js';

describe('countOverdueCustomers', () => {
  it('counts customers whose oldest debit is older than 30 days', () => {
    expect(
      countOverdueCustomers([
        { oldestUnpaidDays: 31 },
        { oldestUnpaidDays: 30 },
        { oldestUnpaidDays: null },
        { oldestUnpaidDays: 90 },
      ]),
    ).toBe(2);
  });
  it('is zero for no data', () => {
    expect(countOverdueCustomers(undefined)).toBe(0);
  });
});
