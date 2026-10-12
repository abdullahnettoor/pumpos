import React, { useMemo } from 'react';
import {
  dashboardTimeline,
  deriveDuHandoverStatuses,
  groupEventPins,
  type TimelineTemplate,
} from '@pump/shared';
import { Button } from '../../../pump-ds/index.js';
import {
  useDashboardSummary,
  useDayActivity,
  useShiftStatus,
  useShiftTemplates,
} from '../../../query/hooks.js';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { isDashboardEvent, toTimelineEvent, type PinTarget } from './timeline/activityPins.js';
import {
  buildBars,
  clockLabel,
  minutesLate,
  money,
  openingChips,
  scheduledEndAt,
  scheduledStartAt,
  scheduleSegments,
  type ShiftBarInput,
} from './timeline/timelineModel.js';
import { TimelineStrip } from './timeline/TimelineStrip.js';
import { useTimelineCollapsed } from './timeline/useTimelineCollapsed.js';

type Row = Record<string, any>;

/** Drawers of the open shift that have not handed over yet. */
function handoversDue(shift: Row | null | undefined, now: number, timeZone: string): number | null {
  if (!shift) return null;
  const statuses = deriveDuHandoverStatuses(
    {
      openedAt: String(shift.openedAt),
      scheduledEndTime: shift.scheduledEndTime,
      staffAssignments: shift.staffAssignments ?? [],
      handovers: shift.handovers ?? [],
    },
    now,
    timeZone,
  );
  return statuses.filter((x) => x !== 'recorded').length;
}

/** Compact Business Day timeline: shift bars, merged event pins, collapsible. */
export const TimelineCard: React.FC = () => {
  const {
    station,
    now: nowDate,
    businessDate,
    entryDate,
    timeZone,
    dayStartsAt,
    onNavigate,
  } = useDashboard();
  const now = nowDate.getTime();
  const enabled = useCardEnabled('timeline');
  const status = useDashboardSummary(station.id, { enabled });
  const shiftStatus = useShiftStatus(station.id, { enabled });
  const templates = useShiftTemplates({ enabled });
  const activity = useDayActivity(station.id, businessDate, { enabled, entryDate });
  const [collapsed, toggle] = useTimelineCollapsed();

  const model = useMemo(() => {
    if (!status.data || !templates.data) return null;
    const day = status.data.today?.shifts ?? [];
    const templateList: TimelineTemplate[] = templates.data;
    const tplById = new Map(templateList.map((t) => [t.id, t]));
    const timeline = dashboardTimeline({
      now: new Date(now),
      shifts: day.map((s) => ({
        shiftTemplateId: s.shiftTemplateId,
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
      })),
      templates: templateList,
      timeZone,
      dayStartsAt,
    });
    const active = (shiftStatus.data as { activeShift?: Row | null } | undefined)?.activeShift;
    const inputs: ShiftBarInput[] = [...day]
      .sort((x, y) => Date.parse(x.openedAt) - Date.parse(y.openedAt))
      .map((s, i) => {
        const tpl = tplById.get(s.shiftTemplateId);
        return {
          id: s.id,
          name: tpl?.name ?? 'Shift',
          sequence: i + 1,
          openedAt: s.openedAt,
          closedAt: s.closedAt ?? null,
          total: s.closedAt ? (s.totalFuelSalesValue ?? null) : null,
          variance: s.closedAt ? (s.cashVariance ?? null) : null,
          scheduledEndAt: scheduledEndAt(tpl, timeline, dayStartsAt),
          scheduledStartAt: scheduledStartAt(tpl, timeline, dayStartsAt),
          handoversDue: s.id === active?.id ? handoversDue(active, now, timeZone) : null,
        };
      });
    const segments = scheduleSegments(templateList, timeline, dayStartsAt);
    return { timeline, inputs, segments };
  }, [status.data, templates.data, shiftStatus.data, timeZone, dayStartsAt, now]);

  const events = useMemo(
    () =>
      (activity.data?.items ?? [])
        .filter((g) => isDashboardEvent(g.primary.eventType))
        .map(toTimelineEvent),
    [activity.data],
  );
  const pins = useMemo(() => groupEventPins(events), [events]);

  if (!enabled) return null;
  const failed = status.isError || templates.isError || activity.isError;
  // Hidden state is only knowable once the shifts are in.
  if (!failed && model && !model.timeline.visible) return null;

  const open = (t: PinTarget) => onNavigate(t.path, t.intent);
  const bars = model ? buildBars(model.inputs, model.timeline, now, timeZone) : [];
  const chips = model ? openingChips(model.inputs, model.timeline, timeZone) : [];
  const alerts = events.filter((e) => e.tone === 'danger').length;
  const lastClosed = model?.inputs.filter((i) => i.closedAt).at(-1);
  const live = model?.inputs.find((i) => !i.closedAt);
  const toggleButton = (
    <Button
      variant="ghost"
      size="xs"
      className="ml-auto"
      onClick={toggle}
      aria-expanded={!collapsed}
    >
      {collapsed ? 'Show timeline ▾' : 'Collapse ▴'}
    </Button>
  );

  return (
    <DashboardCard
      card="timeline"
      title="Timeline"
      query={[status, templates, activity]}
      placeholderHeight={80}
    >
      {model &&
        (collapsed ? (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-muted">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
              Today
            </span>
            <span data-testid="timeline-summary" className="contents">
              {lastClosed && (
                <span>
                  Shift {lastClosed.sequence} closed{' '}
                  {clockLabel(Date.parse(lastClosed.closedAt!), timeZone)}
                  {lastClosed.total != null && (
                    <>
                      {' · '}
                      <b className="font-mono text-ink-strong">{money(lastClosed.total)}</b>
                    </>
                  )}
                </span>
              )}
              {live &&
                (live.scheduledEndAt != null && now > live.scheduledEndAt ? (
                  <span>
                    Shift {live.sequence} <b className="text-warning-fg">past scheduled end</b>
                  </span>
                ) : (
                  <span>
                    Shift {live.sequence} live since{' '}
                    {clockLabel(Date.parse(live.openedAt), timeZone)}
                    {minutesLate(live) != null && ` · opened ${minutesLate(live)}m late`}
                  </span>
                ))}
              <span>
                {events.length} event{events.length === 1 ? '' : 's'}
                {alerts > 0 && (
                  <>
                    {' · '}
                    <b className="text-danger-fg">
                      {alerts} alert{alerts === 1 ? '' : 's'}
                    </b>
                  </>
                )}
              </span>
            </span>
            {toggleButton}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                Today
              </span>
              <span className="text-[12px] text-ink-muted">
                {clockLabel(model.timeline.dayStartAt, timeZone)} →{' '}
                {clockLabel(model.timeline.dayEndAt, timeZone)}
              </span>
              {toggleButton}
            </div>
            <TimelineStrip
              timeline={model.timeline}
              bars={bars}
              chips={chips}
              segments={model.segments}
              pins={pins}
              now={now}
              timeZone={timeZone}
              onOpen={open}
            />
          </>
        ))}
    </DashboardCard>
  );
};
