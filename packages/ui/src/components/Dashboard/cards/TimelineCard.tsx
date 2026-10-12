import React, { useMemo } from 'react';
import { dashboardTimeline, groupEventPins } from '@pump/shared';
import { Button } from '../../../pump-ds/index.js';
import { useDayActivity } from '../../../query/dashboardActivity.js';
import { useShiftStatus, useShiftSummaries, useShiftTemplates } from '../../../query/hooks.js';
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
  const status = useShiftStatus(station.id, true, { enabled });
  const templates = useShiftTemplates({ enabled });
  const activity = useDayActivity(station.id, businessDate, { enabled });
  const summaries = useShiftSummaries(station.id, { enabled });
  const [collapsed, toggle] = useTimelineCollapsed();

  const now = Date.now();
  const model = useMemo(() => {
    if (!status.data || !templates.data || !timeZone || !dayStartsAt) return null;
    const active = status.data.activeShift ? [status.data.activeShift] : [];
    const day = [...(status.data.recentClosedShifts ?? []), ...active].filter(
      (s: any) => s.businessDate === businessDate,
    );
    const byShift = new Map<string, any>(
      (summaries.data ?? []).map((s: any) => [s.shiftId, s.snapshotData]),
    );
    const inputs: ShiftBarInput[] = day
      .map((s: any) => {
        const snap = s.closedAt ? byShift.get(s.id) : null;
        return {
          id: s.id,
          name: s.templateName ?? 'Shift',
          sequence: s.shiftSequence ?? null,
          openedAt: s.openedAt,
          closedAt: s.closedAt ?? null,
          total: snapshotTotal(snap),
          variance: snap ? Number(snap.cashVariance || 0) : null,
        };
      })
      .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
    const timeline = dashboardTimeline({
      now: new Date(now),
      shifts: day.map((s: any) => ({
        shiftTemplateId: s.shiftTemplateId,
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
      })),
      templates: templates.data as any[],
      timeZone,
      dayStartsAt,
    });
    return { timeline, inputs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status.data,
    templates.data,
    summaries.data,
    businessDate,
    timeZone,
    dayStartsAt,
    Math.floor(now / 60_000),
  ]);

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
