import { useDashboardSummary, useShiftStatus, useShiftTemplates } from '../../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../../frame/DashboardContext.js';
import { deriveForecourt, type ForecourtModel } from './derive.js';

/**
 * The Forecourt model plus its three queries. Shared by the card and the
 * column header (same query keys, so one request each); `now` and the station
 * clock come from the dashboard context.
 */
export function useForecourtModel() {
  const { station, now, timeZone, dayStartsAt, businessDate } = useDashboard();
  const enabled = useCardEnabled('forecourt');
  const status = useShiftStatus(station.id, { enabled });
  const summary = useDashboardSummary(station.id, { enabled });
  const templates = useShiftTemplates({ enabled });
  const model: ForecourtModel | null = enabled
    ? deriveForecourt({
        status: status.data,
        summary: summary.data,
        templates: templates.data,
        now: now.getTime(),
        timeZone,
        dayStartsAt,
        businessDate,
      })
    : null;
  return { model, queries: [status, summary, templates] };
}
