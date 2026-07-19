import React from 'react';
import {
  useDailyDssrPreview,
  useDailyDssrRange,
  useCustomers,
  useSuppliers,
  useShiftStatus,
  inr,
} from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';
import { useMobileAlerts } from '../lib/alerts.js';
import type { TabKey } from '../components/BottomNav.js';

interface Props {
  station: Station;
  /** Business day selected by the global pill (YYYY-MM-DD). */
  businessDate: string | null;
  onNavigate?: (tab: TabKey) => void;
}

const numberFmt = (n: number, dec = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const HomeScreen: React.FC<Props> = ({ station, businessDate, onNavigate }) => {
  const settings: any = (station as any).settings || {};
  const todayBiz = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });
  const date = businessDate ?? todayBiz;
  const isToday = date === todayBiz;

  const previewQ = useDailyDssrPreview(station.id, date);
  const customersQ = useCustomers();
  const suppliersQ = useSuppliers();
  const statusQ = useShiftStatus(station.id, true, { enabled: isToday } as any);
  const alerts = useMobileAlerts(station);

  // Compact 7-day fuel-sales trend (closed-day snapshots ending at the selected day).
  const trendQ = useDailyDssrRange(station.id, addDays(date, -6), date);
  const trend = (trendQ.data || [])
    .map((s: any) => ({ date: s.businessDate, sales: Number(s.snapshotData?.fuel?.totalSalesValue || 0) }))
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  const maxTrend = Math.max(1, ...trend.map((t) => t.sales));

  const snap: any = previewQ.data?.snapshotData ?? previewQ.data ?? {};
  const fuel = snap.fuel || {};
  const collections = snap.collections || {};
  const credit = snap.credit || {};
  const expenses = snap.expenses || {};
  const purchases = snap.purchases || {};
  const drawer = snap.drawer || {};
  const pnl = snap.pnl || {};
  const shiftsIncluded = (snap.shifts || []).length;

  const fuelSales = Number(fuel.totalSalesValue || 0);
  const volume = Number(fuel.totalNetVolume ?? fuel.totalVolume ?? 0);
  const collectionsTotal = Number(collections.total || 0);
  const expensesTotal = Number(expenses.total || 0);
  const creditTotal = Number(credit.total || 0);
  const purchasesTotal = Number(purchases.total || 0);
  const cashVariance = Number(drawer.totalCashVariance || 0);
  const netProfit = Number(pnl.netProfit || 0);
  const hasCostBasis = Number(pnl.cogs || 0) > 0;

  const receivables = (customersQ.data || []).reduce(
    (s: number, c: any) => s + Math.max(0, Number(c.currentBalance || 0)),
    0,
  );
  const payables = (suppliersQ.data || []).reduce(
    (s: number, x: any) => s + Math.max(0, Number(x.currentBalance || 0)),
    0,
  );

  const hasActiveShift = isToday && !!statusQ.data?.activeShift;

  if (previewQ.isLoading) {
    return <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Day status banner */}
      <div
        className="flex items-center justify-between rounded-xl border px-4 py-3"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
      >
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isToday ? 'Today · live' : 'Business day'}
          </p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {date}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: hasActiveShift ? 'var(--state-success-bg)' : 'var(--bg-surface-alt)',
            color: hasActiveShift ? 'var(--state-success-fg)' : 'var(--text-muted)',
          }}
        >
          {isToday ? (hasActiveShift ? 'Shift open' : 'No open shift') : `${shiftsIncluded} shift${shiftsIncluded === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Compact attention chip (full feed lives in More → Needs attention) */}
      {alerts.length > 0 && (
        <button
          type="button"
          onClick={() => onNavigate?.('more')}
          className="flex items-center justify-between rounded-lg px-3 py-2"
          style={{
            backgroundColor: alerts.some((a) => a.severity === 'danger') ? 'var(--state-danger-bg)' : 'var(--state-warning-bg)',
          }}
        >
          <span
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: alerts.some((a) => a.severity === 'danger') ? 'var(--state-danger-fg)' : 'var(--state-warning-fg)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: alerts.some((a) => a.severity === 'danger') ? 'var(--state-danger-fg)' : 'var(--state-warning-fg)' }}
            />
            {alerts.length} {alerts.length === 1 ? 'item needs' : 'items need'} attention
          </span>
          <span style={{ color: alerts.some((a) => a.severity === 'danger') ? 'var(--state-danger-fg)' : 'var(--state-warning-fg)' }}>›</span>
        </button>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={isToday ? 'Fuel sales today' : 'Fuel sales'} value={inr(fuelSales)} sub={`${numberFmt(volume, 2)} L net`} tone="positive" />
        <Kpi label="Collections" value={inr(collectionsTotal)} />
        <Kpi label="Expenses" value={inr(expensesTotal)} tone={expensesTotal > 0 ? 'warning' : 'default'} />
        <Kpi label="Purchases" value={inr(purchasesTotal)} />
        <Kpi label="Credit sales" value={inr(creditTotal)} sub="Receivable" />
        <Kpi
          label="Cash variance"
          value={inr(cashVariance)}
          sub={`${shiftsIncluded} shift${shiftsIncluded === 1 ? '' : 's'}`}
          tone={Math.abs(cashVariance) > 100 ? 'negative' : 'default'}
        />
        <Kpi label="Receivables" value={inr(receivables)} sub="Customer dues · current" tone={receivables > 0 ? 'warning' : 'default'} />
        <Kpi label="Payables" value={inr(payables)} sub="Supplier dues · current" tone={payables > 0 ? 'warning' : 'default'} />
        <Kpi
          label={hasCostBasis ? 'Net profit' : 'Net (proxy)'}
          value={inr(hasCostBasis ? netProfit : fuelSales + collectionsTotal - expensesTotal - purchasesTotal)}
          sub={hasCostBasis ? 'After COGS' : 'Set product costs for true P&L'}
          tone={(hasCostBasis ? netProfit : 0) < 0 ? 'negative' : 'default'}
        />
      </div>

      {/* 7-day trend (glance) — full analytics live in More */}
      {trend.length > 1 && (
        <section className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              7-day fuel sales
            </h3>
            <button type="button" onClick={() => onNavigate?.('more')} className="text-[11px] font-medium" style={{ color: 'var(--brand-primary)' }}>
              Details ›
            </button>
          </div>
          <div className="flex h-16 items-end gap-1">
            {trend.map((t) => (
              <div key={t.date} className="flex-1" title={`${t.date} · ${inr(t.sales)}`}>
                <div
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(2, (t.sales / maxTrend) * 100)}%`, backgroundColor: 'var(--brand-primary)', opacity: 0.85 }}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
