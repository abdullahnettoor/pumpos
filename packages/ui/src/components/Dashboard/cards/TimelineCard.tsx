import React, { useEffect, useMemo, useState } from 'react';
import { dashboardTimeline, groupEventPins } from '@pump/shared';
import { Button } from '../../../pump-ds/index.js';
import { useDayActivity } from '../../../query/dashboardActivity.js';
import { useDashboardSummary, useShiftSummaries, useShiftTemplates } from '../../../query/hooks.js';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { toTimelineEvent, type PinTarget } from './timeline/activityPins.js';
import { buildBars, snapshotTotal, type ShiftBarInput } from './timeline/timelineModel.js';
import { BarSummary, TimelineStrip } from './timeline/TimelineStrip.js';
import { useTimelineCollapsed } from './timeline/useTimelineCollapsed.js';

/** Compact Business Day timeline: shift bars, merged event pins, collapsible. */
export const TimelineCard: React.FC = () => {
  const { station, businessDate, timeZone, dayStartsAt, onNavigate } = useDashboard();
  const enabled = useCardEnabled('timeline');
  const status = useDashboardSummary(station.id, { enabled });
  const templates = useShiftTemplates({ enabled });
  const activity = useDayActivity(station.id, businessDate, { enabled });
  const summaries = useShiftSummaries(station.id, { enabled });
  const [collapsed, toggle] = useTimelineCollapsed();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const model = useMemo(() => {
    if (!status.data || !templates.data || !timeZone || !dayStartsAt) return null;
    const day: any[] = status.data.today?.shifts ?? [];
    const tplName = new Map<string, string>(templates.data.map((t) => [t.id, t.name as string]));
    // Summaries carry no id in the dashboard payload; match on the open instant.
    const byOpen = new Map<number, any>(
      (summaries.data ?? []).map((s: any) => [Date.parse(s.openedAt), s.snapshotData]),
    );
    const inputs: ShiftBarInput[] = [...day]
      .sort((x, y) => Date.parse(x.openedAt) - Date.parse(y.openedAt))
      .map((s, i) => {
        const snap = s.closedAt ? byOpen.get(Date.parse(s.openedAt)) : null;
        return {
          id: `${s.shiftTemplateId}-${s.openedAt}`,
          name: tplName.get(s.shiftTemplateId) ?? 'Shift',
          sequence: i + 1,
          openedAt: s.openedAt,
          closedAt: s.closedAt ?? null,
          total: snapshotTotal(snap),
          variance: snap ? Number(snap.cashVariance || 0) : null,
        };
      });
    const timeline = dashboardTimeline({
      now: new Date(now),
      shifts: day.map((s: any) => ({
        shiftTemplateId: s.shiftTemplateId,
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
      })),
      templates: templates.data,
      timeZone,
      dayStartsAt,
    });
    return { timeline, inputs };
  }, [status.data, templates.data, summaries.data, timeZone, dayStartsAt, now]);

  const events = useMemo(() => (activity.data?.items ?? []).map(toTimelineEvent), [activity.data]);
  const pins = useMemo(() => groupEventPins(events), [events]);

  if (!enabled) return null;
  const failed = status.isError || templates.isError || activity.isError;
  // Hidden state is only knowable once the shifts are in; render nothing until then.
  if (!failed && (!model || status.isPending || templates.isPending)) return null;
  if (!failed && model && !model.timeline.visible) return null;

  const open = (t: PinTarget) => onNavigate(t.path, t.intent);
  const bars = model ? buildBars(model.inputs, model.timeline, now) : [];
  const live = bars.filter((b) => b.kind === 'running');
  const closed = bars.filter((b) => b.kind === 'closed');
  const summary = [
    'Today',
    closed.length ? `${closed.at(-1)!.label} closed` : null,
    live.length ? `${live[0].label} live` : null,
    `${events.length} event${events.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DashboardCard
      card="timeline"
      title="Timeline"
      query={[status, templates, activity]}
      placeholderHeight={collapsed ? 20 : 76}
      action={
        <Button variant="ghost" size="xs" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? 'Show timeline ▾' : 'Hide ▴'}
        </Button>
      }
    >
      {collapsed ? (
        <p className="text-[12.5px] text-ink-muted" data-testid="timeline-summary">
          {summary}
        </p>
      ) : (
        model && (
          <>
            <TimelineStrip
              timeline={model.timeline}
              bars={bars}
              pins={pins}
              now={now}
              timeZone={timeZone!}
              onOpen={open}
            />
            <BarSummary bars={bars} />
          </>
        )
      )}
    </DashboardCard>
  );
};
