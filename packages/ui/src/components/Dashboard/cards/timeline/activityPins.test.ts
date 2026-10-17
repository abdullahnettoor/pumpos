import { describe, expect, it } from 'vitest';
import { toTimelineEvent } from './activityPins.js';

const item = (eventType: string, tone = 'info', aggregateId = 'agg-1') =>
  ({
    groupId: `g-${eventType}`,
    primary: { eventType, tone, aggregateId, title: eventType, occurredAt: '2026-10-12T06:00:00Z' },
  }) as any;

describe('toTimelineEvent', () => {
  it('opens the Shift Summary for a closed shift', () => {
    const e = toTimelineEvent(item('SHIFT_CLOSED', 'success', 'sh-9'));
    expect(e.target).toEqual({ path: '/shifts', intent: { openShiftSummaryId: 'sh-9' } });
    expect(e.tone).toBe('success');
  });
  it('maps decantation to inventory with warning when flagged', () => {
    const e = toTimelineEvent(item('DECANTATION_FLAGGED'));
    expect(e.target).toEqual({ path: '/inventory', intent: { focusInventoryTab: 'decantations' } });
    expect(e.tone).toBe('warning');
  });
  it('opens the Daily cash book (Accounts) for an Office Record', () => {
    expect(toTimelineEvent(item('EXPENSE_RECORDED')).target).toEqual({
      path: '/accounts',
      intent: { openAccountsTab: 'cash-book' },
    });
  });
  it('opens Suppliers for a purchase', () => {
    expect(toTimelineEvent(item('PURCHASE_CREATED')).target).toEqual({ path: '/suppliers' });
  });
  it('falls back to a neutral pin with no target for unknown types', () => {
    const e = toTimelineEvent(item('SOMETHING_NEW', 'default'));
    expect(e).toMatchObject({ icon: 'info', tone: 'neutral', target: null });
  });
});
