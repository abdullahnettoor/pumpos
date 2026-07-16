import React, { useState } from 'react';
import { useDailyDssrPreview, inr } from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';

interface Props {
  station: Station;
}

const numberFmt = (n: number, dec = 2) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const DssrScreen: React.FC<Props> = ({ station }) => {
  const settings: any = (station as any).settings || {};
  const todayBiz = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });
  const [date, setDate] = useState(todayBiz);

  const q = useDailyDssrPreview(station.id, date);
  const snapshot: any = q.data?.snapshotData ?? q.data ?? {};
  const fuel = snapshot.fuel || {};
  const collections = snapshot.collections || {};
  const credit = snapshot.credit || {};
  const expenses = snapshot.expenses || {};
  const shiftsIncluded = (snapshot.shifts || []).length;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Business date</span>
        <input
          type="date"
          value={date}
          max={todayBiz}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)', color: 'var(--text-strong)' }}
        />
      </label>

      {q.isLoading ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : q.isError ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--state-danger-fg)' }}>
          Could not load DSSR for this date.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              label="Fuel sales"
              value={inr(Number(fuel.totalSalesValue || 0))}
              sub={`${numberFmt(Number(fuel.totalNetVolume ?? fuel.totalVolume ?? 0))} L net`}
              tone="positive"
            />
            <Kpi label="Collections" value={inr(Number(collections.total || 0))} />
            <Kpi label="Expenses" value={inr(Number(expenses.total || 0))} tone={Number(expenses.total || 0) > 0 ? 'warning' : 'default'} />
            <Kpi
              label="Credit sales"
              value={inr(Number(credit.normalCredit || 0) + Number(credit.fleetCredit || 0))}
              sub="Receivable"
            />
          </div>

          <section
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
          >
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Collections breakdown
            </h3>
            <dl className="flex flex-col gap-2 text-sm">
              {[
                ['Cash', collections.Cash],
                ['Card', collections.Card],
                ['UPI', collections.UPI],
                ['Bank transfer', collections.BankTransfer],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                  <dd className="font-mono tabular-nums" style={{ color: 'var(--text-strong)' }}>
                    {inr(Number(val || 0))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
            {date === todayBiz ? 'Live preview · ' : ''}
            {shiftsIncluded} shift{shiftsIncluded === 1 ? '' : 's'} included
          </p>
        </>
      )}
    </div>
  );
};
