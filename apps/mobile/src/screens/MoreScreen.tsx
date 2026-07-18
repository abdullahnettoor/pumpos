import React, { useState } from 'react';
import { useDailyDssrRange, useInventoryStatus, useUsers, useOrganization, useStations, inr } from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';
import { AlertList } from '../components/AlertList.js';
import { Collapsible } from '../components/Collapsible.js';
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

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  Owner: { bg: 'rgba(99,102,241,0.15)', fg: '#6366f1' },
  Manager: { bg: 'rgba(16,185,129,0.15)', fg: 'rgb(16,185,129)' },
  Accountant: { bg: 'rgba(46,94,136,0.15)', fg: '#2e5e88' },
  Staff: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
  Attendant: { bg: 'rgba(245,158,11,0.15)', fg: '#d97706' },
  Offline: { bg: 'rgba(245,158,11,0.15)', fg: '#d97706' },
};

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
  const usersQ = useUsers();
  const orgQ = useOrganization();
  const stationsQ = useStations();

  const org: any = orgQ.data || {};
  const orgGstin = org?.metadata?.gstin || org?.metadata?.legal?.gstin || null;
  const team: any[] = usersQ.data || [];
  const stationNameById = new Map<string, string>((stationsQ.data || []).map((s: any) => [s.id, s.name]));

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
  const lowTanks = tanks.filter((t) => {
    const cap = Number(t.capacity) || 0;
    return cap > 0 && (Number(t.currentVolume) || 0) / cap < 0.2;
  }).length;
  const daysOfCover = (tank: any): number | null => {
    const avg = (prodMap.get(String(tank.productId))?.volume ?? 0) / daysWithData;
    return avg > 0 ? tank.currentVolume / avg : null;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Needs attention */}
      <Collapsible
        title="Needs attention"
        summary={alerts.length ? `${alerts.length} item${alerts.length === 1 ? '' : 's'} to review` : 'All clear'}
        badge={alerts.length ? { text: String(alerts.length), tone: alerts.some((a) => a.severity === 'danger') ? 'danger' : 'warning' } : undefined}
        defaultOpen={false}
      >
        <AlertList alerts={alerts} onNavigate={onNavigate} emptyText="All clear — nothing needs attention." />
      </Collapsible>

      {/* Trends & analytics */}
      <Collapsible
        title="Trends & analytics"
        summary={series.length ? `${inr(totalSales)} fuel sales · last ${days} days` : 'No closed days yet'}
      >
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
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
          <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading trends…</p>
        ) : series.length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No closed business days in this period yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Fuel sales" value={inr(totalSales)} sub={`${daysWithData} day${daysWithData === 1 ? '' : 's'}`} tone="positive" />
              <Kpi label="Avg / day" value={inr(avgSales)} />
              <Kpi label="Volume" value={`${numberFmt(totalVolume)} L`} sub="Net of testing" />
              <Kpi label="Expense ratio" value={`${expenseRatio.toFixed(1)}%`} sub="of fuel sales" tone={expenseRatio > 5 ? 'warning' : 'default'} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Daily fuel sales
              </p>
              <div className="flex h-28 items-end gap-1">
                {series.map((s) => (
                  <div key={s.date} className="flex flex-1 flex-col items-center justify-end" title={`${shortDate(s.date)} · ${inr(s.sales)}`}>
                    <div className="w-full rounded-t" style={{ height: `${Math.max(2, (s.sales / maxSales) * 100)}%`, backgroundColor: 'var(--brand-primary)', opacity: 0.85 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px]" style={{ color: 'var(--text-faint)' }}>
                <span>{shortDate(series[0].date)}</span>
                <span>{shortDate(series[series.length - 1].date)}</span>
              </div>
            </div>

            {products.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Product mix
                </p>
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
              </div>
            )}
          </div>
        )}
      </Collapsible>

      {/* Inventory & tanks */}
      <Collapsible
        title="Inventory & tanks"
        summary={tanks.length ? `${tanks.length} tank${tanks.length === 1 ? '' : 's'}${lowTanks ? ` · ${lowTanks} low` : ''}` : 'No tanks configured'}
        badge={lowTanks ? { text: `${lowTanks} low`, tone: 'warning' } : undefined}
      >
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
      </Collapsible>

      {/* Team */}
      <Collapsible title="Team" summary={`${team.length} member${team.length === 1 ? '' : 's'}`}>
        {usersQ.isLoading ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : team.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No team members yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {team.map((u) => {
              const offline = !u.email;
              const tag = offline ? 'Offline' : u.role;
              const style = ROLE_STYLE[tag] ?? ROLE_STYLE.Staff;
              const stationsLabel =
                u.role === 'Owner'
                  ? 'All stations'
                  : (u.stationIds || []).map((id: string) => stationNameById.get(id)).filter(Boolean).join(', ') || 'No station';
              return (
                <div key={u.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm" style={{ color: u.status === 'INACTIVE' ? 'var(--text-faint)' : 'var(--text-default)' }}>
                      {u.fullName}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>{stationsLabel}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {u.status === 'INACTIVE' && (
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>Inactive</span>
                    )}
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: style.bg, color: style.fg }}>
                      {tag}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Collapsible>

      {/* Organization */}
      <Collapsible title="Organization" summary={org?.name ?? undefined}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{org?.name ?? '—'}</p>
        {orgGstin && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>GSTIN {orgGstin}</p>}
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {(stationsQ.data || []).length} station{(stationsQ.data || []).length === 1 ? '' : 's'}
        </p>
      </Collapsible>
    </div>
  );
};
