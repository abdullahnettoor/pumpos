import React from 'react';
import {
  useDailyDssrPreview,
  useCustomers,
  useSuppliers,
  useShiftStatus,
  useStationAlerts,
  inr,
} from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';

interface Props {
  station: Station;
  /** Business day selected by the global pill (YYYY-MM-DD). */
  businessDate: string | null;
}

const numberFmt = (n: number, dec = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const SEV_COLOR: Record<string, { bg: string; fg: string }> = {
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  info: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
};

export const HomeScreen: React.FC<Props> = ({ station, businessDate }) => {
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
  const alerts = useStationAlerts(station.id, true);

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
  const topAlerts = alerts.slice(0, 3);

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

      {/* Exceptions */}
      {topAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {topAlerts.map((a) => {
            const c = SEV_COLOR[a.severity] ?? SEV_COLOR.info;
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ backgroundColor: c.bg }}
              >
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.fg }} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" style={{ color: c.fg }}>{a.title}</p>
                  {a.meta && <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.meta}</p>}
                </div>
              </div>
            );
          })}
        </div>
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
    </div>
  );
};
