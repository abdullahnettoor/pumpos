import React, { useState } from 'react';
import { useDailyDssrRange, useInventoryStatus, inr } from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';
import { AlertList } from '../components/AlertList.js';
import { useMobileAlerts } from '../lib/alerts.js';
import type { TabKey } from '../components/BottomNav.js';

interface Props {
  station: Station;
  onNavigate?: (tab: TabKey) => void;
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};
const numberFmt = (n: number, dec = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const PRODUCT_BAR = ['var(--brand-primary)', '#0891b2', '#7c3aed', '#d97706', '#059669'];

export const MoreScreen: React.FC<Props> = ({ station, onNavigate }) => {
  const settings: any = (station as any).settings || {};
  const todayBiz = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });

  const alerts = useMobileAlerts(station);
  const [days, setDays] = useState(7);
  const from = addDays(todayBiz, -(days - 1));

  const rangeQ = useDailyDssrRange(station.id, from, todayBiz);
  const invQ = useInventoryStatus(station.id);

  const snaps = (rangeQ.data || [])
    .map((s: any) => ({ date: s.businessDate, d: s.snapshotData || {} }))
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  const series = snaps.map((s: any) => ({
    date: s.date,
    sales: Number(s.d.fuel?.totalSalesValue || 0),
    volume: Number(s.d.fuel?.totalNetVolume ?? s.d.fuel?.totalVolume ?? 0),
    expenses: Number(s.d.expenses?.total || 0),
  }));

  const totalSales = series.reduce((a, s) => a + s.sales, 0);
  const totalVolume = series.reduce((a, s) => a + s.volume, 0);
  const totalExpenses = series.reduce((a, s) => a + s.expenses, 0);
  const daysWithData = series.length || 1;
  const avgSales = totalSales / daysWithData;
  const expenseRatio = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;
  const maxSales = Math.max(1, ...series.map((s) => s.sales));

  // Product mix + avg daily volume per product (for days-of-cover).
  const prodMap = new Map<string, { name: string; value: number; volume: number }>();
  for (const s of snaps) {
    for (const p of (s.d.fuel?.byProduct || []) as any[]) {
      const key = String(p.productId || p.productName);
      const cur = prodMap.get(key) || { name: p.productName || 'Fuel', value: 0, volume: 0 };
      cur.value += Number(p.salesValue || 0);
      cur.volume += Number(p.netVolume || 0);
      prodMap.set(key, cur);
    }
  }
  const products = [...prodMap.entries()]
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.value - a.value);
  const prodTotal = products.reduce((a, p) => a + p.value, 0) || 1;

  const tanks: any[] = invQ.data || [];
  const daysOfCover = (tank: any): number | null => {
    const avg = (prodMap.get(String(tank.productId))?.volume ?? 0) / daysWithData;
    return avg > 0 ? tank.currentVolume / avg : null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Needs attention */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Needs attention
        </h3>
        <AlertList alerts={alerts} onNavigate={onNavigate} emptyText="All clear — nothing needs attention." />
      </section>

      {/* Period toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
        {[7, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className="rounded-md py-1.5 text-sm font-medium transition"
            style={{
              backgroundColor: days === d ? 'var(--bg-surface)' : 'transparent',
              color: days === d ? 'var(--text-strong)' : 'var(--text-muted)',
              boxShadow: days === d ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {rangeQ.isLoading ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading trends…</p>
      ) : series.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}>
          No closed business days in this period yet. Trends appear once days are closed.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Fuel sales" value={inr(totalSales)} sub={`${daysWithData} day${daysWithData === 1 ? '' : 's'}`} tone="positive" />
            <Kpi label="Avg / day" value={inr(avgSales)} />
            <Kpi label="Volume" value={`${numberFmt(totalVolume)} L`} sub="Net of testing" />
            <Kpi label="Expense ratio" value={`${expenseRatio.toFixed(1)}%`} sub="of fuel sales" tone={expenseRatio > 5 ? 'warning' : 'default'} />
          </div>

          {/* Sales trend bars */}
          <section className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Daily fuel sales
            </h3>
            <div className="flex h-28 items-end gap-1">
              {series.map((s) => (
                <div key={s.date} className="flex flex-1 flex-col items-center justify-end" title={`${shortDate(s.date)} · ${inr(s.sales)}`}>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(2, (s.sales / maxSales) * 100)}%`, backgroundColor: 'var(--brand-primary)', opacity: 0.85 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px]" style={{ color: 'var(--text-faint)' }}>
              <span>{shortDate(series[0].date)}</span>
              <span>{shortDate(series[series.length - 1].date)}</span>
            </div>
          </section>

          {/* Product mix */}
          {products.length > 0 && (
            <section className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Product mix
              </h3>
              <div className="flex flex-col gap-3">
                {products.map((p, i) => {
                  const pct = (p.value / prodTotal) * 100;
                  return (
                    <div key={p.id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-default)' }}>{p.name}</span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {inr(p.value)} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PRODUCT_BAR[i % PRODUCT_BAR.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Tank levels + days of cover */}
      <section className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Tank levels
        </h3>
        {invQ.isLoading ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : tanks.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No tanks configured.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {tanks.map((t) => {
              const cap = Number(t.capacity) || 0;
              const vol = Number(t.currentVolume) || 0;
              const pct = cap > 0 ? Math.min(100, (vol / cap) * 100) : 0;
              const cover = daysOfCover(t);
              const low = pct < 20;
              const barColor = pct < 12 ? 'var(--state-danger-fg)' : pct < 25 ? 'var(--state-warning-fg)' : 'var(--brand-primary)';
              return (
                <div key={t.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-default)' }}>
                      {t.name} · {t.productName}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: low ? 'var(--state-danger-fg)' : 'var(--text-muted)' }}>
                      {numberFmt(vol)} / {numberFmt(cap)} {t.productUnit || 'L'} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {cover != null ? `~${Math.floor(cover)} days of cover at recent sales` : 'Days of cover: not enough sales history'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
