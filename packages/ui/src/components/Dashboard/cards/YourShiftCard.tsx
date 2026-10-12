import React, { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '../../../pump-ds/index.js';
import { formatMoney } from '../../../utils/format.js';
import {
  useDensityTodaySummary,
  useDashboardSummary,
  useShiftStatus,
  useShiftTemplates,
} from '../../../query/hooks.js';
import {
  useStationAlerts,
  type ShiftAlertInput,
  type StationAlert,
} from '../../../query/useStationAlerts.js';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { formatAsOf } from '../frame/headerText.js';
import { shiftCashDrops } from './yourShift/cashDrops.js';

/** Staff's Your shift (replaces Money). Owns its file; keep the export name. */
export const YourShiftCard: React.FC = () => {
  const { station, businessDate, timeZone, onNavigate } = useDashboard();
  const enabled = useCardEnabled('yourShift');
  const now = useNow(enabled);

  const shiftQ = useShiftStatus(station.id, false, { enabled });
  const summaryQ = useDashboardSummary(station.id, { enabled });
  const templatesQ = useShiftTemplates({ enabled });
  const densityQ = useDensityTodaySummary(station.id, businessDate, { enabled });

  const activeShift = (shiftQ.data?.activeShift ?? null) as ShiftAlertInput['activeShift'];
  const alertInput = useMemo<ShiftAlertInput | null>(
    () =>
      enabled && shiftQ.data && summaryQ.data && templatesQ.data && densityQ.data
        ? {
            now: now.getTime(),
            timeZone: timeZone ?? 'UTC',
            activeShift,
            shiftsClosedToday: Number(summaryQ.data.today?.shiftsClosed ?? 0),
            plannedShiftCount: (templatesQ.data as { isActive?: boolean }[]).filter(
              (t) => t.isActive !== false,
            ).length,
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
      activeShift,
    ],
  );
  const alerts = useStationAlerts(station.id, enabled, alertInput);
  const todos = alerts.filter((a) => a.category !== 'oversold');
  const { drops, total } = shiftCashDrops(activeShift?.handovers);

  return (
    <DashboardCard
      card="yourShift"
      title="Your shift"
      query={[shiftQ, summaryQ, templatesQ, densityQ]}
      placeholderHeight={220}
      footer={
        <button
          type="button"
          className="text-[12.5px] text-accent hover:underline"
          onClick={() => onNavigate('/shifts')}
        >
          Shift workspace ›
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <section aria-label="To do" className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            To do
          </h3>
          {todos.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">Nothing to do.</p>
          ) : (
            todos.map((a) => <TodoRow key={a.id} alert={a} onNavigate={onNavigate} />)
          )}
        </section>

        <section aria-label="Cash drops this shift" className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Cash drops this shift
          </h3>
          {!activeShift ? (
            <p className="text-[12.5px] text-ink-muted">No shift open.</p>
          ) : drops.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">No cash drops yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 text-[12.5px]">
                {drops.slice(0, 3).map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3">
                    <span className="text-ink-muted">
                      {d.at ? formatAsOf(new Date(d.at), timeZone) : '—'} · {d.duName} ·{' '}
                      {d.attendant}
                    </span>
                    <span className="tabular-nums">{formatMoney(d.amount)}</span>
                  </li>
                ))}
              </ul>
              {drops.length > 3 && (
                <div className="text-[12px] text-ink-muted">+{drops.length - 3} more</div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-[12.5px]">
                <span className="text-ink-muted">Total</span>
                <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
              </div>
            </>
          )}
        </section>
      </div>
    </DashboardCard>
  );
};

/** One to-do: the action only where Staff may act; otherwise "tell the manager". */
const TodoRow: React.FC<{ alert: StationAlert; onNavigate: (path: string) => void }> = ({
  alert,
  onNavigate,
}) => {
  const toManager = alert.category === 'stock' || alert.category === 'density';
  const meta = toManager
    ? [alert.meta, 'tell the manager'].filter(Boolean).join(' · ')
    : alert.meta;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{alert.title}</div>
        {meta && <div className="truncate text-[12px] text-ink-muted">{meta}</div>}
      </div>
      {!toManager && alert.actionLabel && alert.actionPath && (
        <Button
          variant="secondary"
          size="xs"
          leftIcon={<Play />}
          onClick={() => onNavigate(alert.actionPath!)}
        >
          {alert.actionLabel}
        </Button>
      )}
    </div>
  );
};

/** Minute ticker (only while enabled), like the header's clock. */
function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}
