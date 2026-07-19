import React from 'react';
import { useShiftStatus, useShiftSummaries, generateShiftSummaryPdf, inr } from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { ShareButton } from '../components/ShareButton.js';

interface Props {
  station: Station;
}

function elapsed(from?: string): string {
  if (!from) return '';
  const ms = Date.now() - new Date(from).getTime();
  if (ms < 0) return '';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const timeFmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Variance chip color: faint (small), amber (moderate), red (large). */
const varColor = (v: number) =>
  Math.abs(v) < 50 ? 'var(--text-faint)' : Math.abs(v) < 200 ? 'var(--state-warning-fg)' : 'var(--state-danger-fg)';

export const ShiftsScreen: React.FC<Props> = ({ station }) => {
  const settings: any = (station as any).settings || {};
  const todayBiz = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });

  const statusQ = useShiftStatus(station.id);
  const summariesQ = useShiftSummaries(station.id);

  const active = statusQ.data?.activeShift;
  const readings: any[] = active?.nozzleReadings || [];
  const assignments: any[] = active?.staffAssignments || [];
  const handovers: any[] = active?.handovers || [];
  const handoverByKey = new Map<string, any>(handovers.map((h) => [`${h.userId}:${h.duId}`, h]));

  const bizDay: any = statusQ.data?.businessDay;
  const staleDayOpen = bizDay?.status === 'OPEN' && bizDay?.businessDate && bizDay.businessDate < todayBiz;

  const recorded = assignments.filter((a) => handoverByKey.has(`${a.userId}:${a.duId}`)).length;

  const recent = (summariesQ.data || [])
    .slice()
    .sort((a: any, b: any) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      {staleDayOpen && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ backgroundColor: 'var(--state-warning-bg)', borderColor: 'var(--state-warning-fg)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--state-warning-fg)' }}>
            Business day {bizDay.businessDate} still open
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Close it from the desktop console to finalize the day's DSSR.
          </p>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Live shift
        </h2>
        {statusQ.isLoading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : active ? (
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {active.templateName || 'Shift'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {active.openedByName || 'Operator'} · opened {timeFmt(active.openedAt)}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success-fg)' }}
              >
                {elapsed(active.openedAt)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Opening cash</p>
                <p className="font-mono font-semibold tabular-nums">{inr(Number(active.openingCash || 0))}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nozzles</p>
                <p className="font-mono font-semibold tabular-nums">{readings.length}</p>
              </div>
            </div>

            {/* Assigned attendants + handover status */}
            {assignments.length > 0 && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Attendants
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {recorded}/{assignments.length} recorded
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {assignments.map((a: any, i: number) => {
                    const h = handoverByKey.get(`${a.userId}:${a.duId}`);
                    const isRecorded = !!h;
                    const variance = Number(h?.varianceAmount || 0);
                    return (
                      <div key={a.id ?? i} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm" style={{ color: 'var(--text-default)' }}>{a.userName}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{a.duName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isRecorded && (
                            <span className="font-mono text-[11px] tabular-nums" style={{ color: varColor(variance) }}>
                              Var {inr(variance)}
                            </span>
                          )}
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: isRecorded ? 'var(--state-success-bg)' : 'var(--bg-surface-alt)',
                              color: isRecorded ? 'var(--state-success-fg)' : 'var(--text-muted)',
                            }}
                          >
                            {isRecorded ? 'Recorded' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl border border-dashed p-6 text-center text-sm"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
          >
            No open shift right now.
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Recent shifts
        </h2>
        <div className="flex flex-col gap-2">
          {recent.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No closed shifts yet.</p>
          )}
          {recent.map((s: any, i: number) => {
            const variance = Number(s.snapshotData?.cashVariance || 0);
            return (
              <div
                key={s.id ?? s.shiftId ?? s.summaryId ?? i}
                className="flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                    {s.templateName || 'Shift'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeFmt(s.openedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {inr(Number(s.snapshotData?.totalFuelSalesValue || 0))}
                    </p>
                    <p className="text-xs font-medium" style={{ color: varColor(variance) }}>
                      Var {inr(variance)}
                    </p>
                  </div>
                  <ShareButton
                    iconOnly
                    label="Shift summary PDF"
                    onShare={() => generateShiftSummaryPdf(station, s.snapshotData, s.shiftId ?? s.id, s.templateName)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
