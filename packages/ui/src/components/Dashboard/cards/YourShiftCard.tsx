import React, { useMemo } from 'react';
import { ClipboardCheck, Gauge, Play, TriangleAlert, type LucideIcon } from 'lucide-react';
import { nextShiftToOpen, type TimelineTemplate } from '@pump/shared';
import { Button } from '../../../pump-ds/index.js';
import {
  useDensityTodaySummary,
  useDashboardSummary,
  useShiftStatus,
  useShiftTemplates,
} from '../../../query/hooks.js';
import {
  useStationAlerts,
  type AlertSeverity,
  type ShiftAlertInput,
  type StationAlert,
} from '../../../query/useStationAlerts.js';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';

/** Staff's Your shift (replaces Money). Owns its file; keep the export name. */
export const YourShiftCard: React.FC = () => {
  const { station, now, businessDate, timeZone, dayStartsAt, onNavigate } = useDashboard();
  const enabled = useCardEnabled('yourShift');

  const shiftQ = useShiftStatus(station.id, { enabled });
  const summaryQ = useDashboardSummary(station.id, { enabled });
  const templatesQ = useShiftTemplates({ enabled });
  const densityQ = useDensityTodaySummary(station.id, businessDate, { enabled });

  const activeShift = (shiftQ.data?.activeShift ?? null) as ShiftAlertInput['activeShift'];
  const alertInput = useMemo<ShiftAlertInput | null>(
    () =>
      enabled && shiftQ.data && summaryQ.data && templatesQ.data && densityQ.data
        ? {
            now: now.getTime(),
            timeZone,
            activeShift,
            nextShift: nextShiftToOpen({
              now,
              shifts: summaryQ.data.today?.shifts ?? [],
              templates: templatesQ.data as TimelineTemplate[],
              timeZone,
              dayStartsAt,
            }),
            densityToday: densityQ.data,
          }
        : null,
    [
      enabled,
      shiftQ.data,
      summaryQ.data,
      templatesQ.data,
      densityQ.data,
      now,
      timeZone,
      dayStartsAt,
      activeShift,
    ],
  );
  const alerts = useStationAlerts(station.id, enabled, alertInput);
  const todos = alerts.filter((a) => a.category !== 'oversold');

  return (
    <DashboardCard
      card="yourShift"
      title="Your shift"
      query={[shiftQ, summaryQ, templatesQ, densityQ]}
      placeholderHeight={160}
      flush
      footer={
        <button
          type="button"
          className="text-[12.5px] text-brand hover:underline"
          onClick={() => onNavigate('/shifts')}
        >
          Shift workspace ›
        </button>
      }
    >
      <section aria-label="To do" className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border-soft px-3.5 py-2.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            To do
          </h3>
          <span
            className="rounded-full bg-warning-bg px-2 text-[11px] font-semibold tabular-nums text-warning-fg"
            aria-label={`${todos.length} to do`}
          >
            {todos.length}
          </span>
        </div>
        {todos.length === 0 ? (
          <p className="px-3.5 py-2.5 text-[12.5px] text-ink-muted">Nothing to do.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-soft">
            {todos.map((a) => (
              <li key={a.id} className="px-3.5 py-2.5">
                <TodoRow alert={a} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardCard>
  );
};

const TILE_TONE: Record<AlertSeverity, string> = {
  danger: 'bg-danger-bg text-danger-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
};

/** The action a to-do offers. Low stock stays "tell the manager" (no action). */
interface TodoAction {
  label: string;
  icon: LucideIcon;
  path: string;
  intent?: { focusInventoryTab: 'density' };
}

function todoAction(alert: StationAlert): TodoAction | null {
  if (alert.category === 'density') {
    return {
      label: 'Record',
      icon: Gauge,
      path: '/inventory',
      intent: { focusInventoryTab: 'density' },
    };
  }
  if (alert.category === 'stock' || !alert.actionLabel || !alert.actionPath) return null;
  const icon = alert.id === 'open-shift' ? Play : ClipboardCheck;
  return { label: alert.actionLabel, icon, path: alert.actionPath };
}

/** Tile icon: what the to-do is about (not the action). */
function todoIcon(alert: StationAlert): React.ReactNode {
  if (alert.category === 'density') return <Gauge className="size-3.5" />;
  if (alert.category === 'stock') return <TriangleAlert className="size-3.5" />;
  return alert.id === 'open-shift' ? (
    <Play className="size-3.5" />
  ) : (
    <ClipboardCheck className="size-3.5" />
  );
}

/** One to-do: a tinted 28px icon tile, title and meta, and an optional 28px action. */
const TodoRow: React.FC<{
  alert: StationAlert;
  onNavigate: (path: string, intent?: { focusInventoryTab: 'density' }) => void;
}> = ({ alert, onNavigate }) => {
  const action = todoAction(alert);
  const toManager = alert.category === 'stock';
  const meta = toManager
    ? [alert.meta, 'tell the manager'].filter(Boolean).join(' · ')
    : alert.meta;
  const tileIcon = todoIcon(alert);
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-md ${TILE_TONE[alert.severity]}`}
      >
        {tileIcon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-ink">{alert.title}</div>
        {meta && <div className="truncate text-[11px] text-ink-muted">{meta}</div>}
      </div>
      {action && (
        <Button
          variant="secondary"
          size="xs"
          className="shrink-0"
          leftIcon={<action.icon />}
          onClick={() =>
            action.intent ? onNavigate(action.path, action.intent) : onNavigate(action.path)
          }
        >
          {action.label}
        </Button>
      )}
    </div>
  );
};
