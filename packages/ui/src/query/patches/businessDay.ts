import type { BusinessDayStatusItem, BusinessDayStatusResponse } from '../../services/cloud.js';

/**
 * A closed Business Day (POST /shifts/business-day/close) in the cached
 * business-day status (`queryKeys.businessDayStatus(station, date)`, #606).
 *
 * The answer is the Business Day itself: its status and when it closed. That
 * is all this writes. The DSR the close generated, and the day's figures in
 * the Business days list, are not in the answer; they arrive with the refetch.
 */
export interface ClosedBusinessDay {
  id: string;
  businessDate: string;
  status: string;
  closedAt: string | null;
}

export function withClosedBusinessDay(
  status: BusinessDayStatusResponse,
  day: ClosedBusinessDay,
): BusinessDayStatusResponse {
  if (day.status !== 'CLOSED') return status;
  const close = (item: BusinessDayStatusItem): BusinessDayStatusItem =>
    item.id === day.id ? { ...item, status: 'CLOSED', closedAt: day.closedAt } : item;
  const listed = (items: BusinessDayStatusItem[]) => items.some((i) => i.id === day.id);
  const touches =
    listed(status.recentBusinessDays) ||
    listed(status.openBusinessDays) ||
    listed(status.pastOpenBusinessDays) ||
    status.requestedBusinessDay?.id === day.id;
  if (!touches) return status;
  const requested = status.requestedBusinessDay?.id === day.id;
  return {
    ...status,
    requestedState: requested ? 'CLOSED' : status.requestedState,
    requestedBusinessDay: status.requestedBusinessDay && close(status.requestedBusinessDay),
    openBusinessDays: status.openBusinessDays.filter((i) => i.id !== day.id),
    pastOpenBusinessDays: status.pastOpenBusinessDays.filter((i) => i.id !== day.id),
    recentBusinessDays: status.recentBusinessDays.map(close),
  };
}
