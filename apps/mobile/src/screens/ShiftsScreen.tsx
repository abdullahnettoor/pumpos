import React from 'react';
import { useShiftStatus, useShiftSummaries, inr } from '@pump/ui';
import type { Station } from '@pump/shared';

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

export const ShiftsScreen: React.FC<Props> = ({ station }) => {
  const statusQ = useShiftStatus(station.id);
  const summariesQ = useShiftSummaries(station.id);

  const active = statusQ.data?.activeShift;
  const readings: any[] = active?.nozzleReadings || [];
  const recent = (summariesQ.data || [])
    .slice()
    .sort((a: any, b: any) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
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
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {inr(Number(s.snapshotData?.totalFuelSalesValue || 0))}
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: Math.abs(variance) > 100 ? 'var(--state-danger-fg)' : 'var(--text-faint)' }}
                  >
                    Var {inr(variance)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
