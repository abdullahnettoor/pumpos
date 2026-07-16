import React from 'react';
import {
  useShiftSummaries,
  useCollections,
  useExpenses,
  usePurchases,
  useCustomers,
  useSuppliers,
  useShiftStatus,
  inr,
} from '@pump/ui';
import { resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { Kpi } from '../components/Kpi.js';

interface Props {
  station: Station;
}

const numberFmt = (n: number, dec = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const HomeScreen: React.FC<Props> = ({ station }) => {
  const settings: any = (station as any).settings || {};
  const timeZone: string | undefined = settings.timezone;
  const dayStartsAt: string | undefined = settings.business_day_starts_at;
  const todayBiz = resolveBusinessDate({ timeZone, dayStartsAt });

  const summariesQ = useShiftSummaries(station.id);
  const collectionsQ = useCollections();
  const expensesQ = useExpenses();
  const purchasesQ = usePurchases();
  const customersQ = useCustomers();
  const suppliersQ = useSuppliers();
  const statusQ = useShiftStatus(station.id, true);

  const isLoading =
    summariesQ.isLoading || collectionsQ.isLoading || expensesQ.isLoading || purchasesQ.isLoading;

  const sumToday = (rows: any[] | undefined) =>
    (rows || [])
      .filter(
        (r) => (r.businessDate ?? r.shiftDate) === todayBiz && (r.stationId ? r.stationId === station.id : true),
      )
      .reduce((s, r) => s + Number(r.amount || 0), 0);

  const todayShifts = (summariesQ.data || []).filter(
    (s: any) => resolveBusinessDate({ now: new Date(s.openedAt), timeZone, dayStartsAt }) === todayBiz,
  );
  const todayFuelSales = todayShifts.reduce(
    (sum: number, s: any) => sum + Number(s.snapshotData?.totalFuelSalesValue || 0),
    0,
  );
  const todayVolume = todayShifts.reduce(
    (sum: number, s: any) => sum + Number(s.snapshotData?.totalVolume || 0),
    0,
  );
  const todayCashVariance = todayShifts.reduce(
    (sum: number, s: any) => sum + Number(s.snapshotData?.cashVariance || 0),
    0,
  );
  const todayCollections = sumToday(collectionsQ.data);
  const todayExpenses = sumToday(expensesQ.data);
  const todayPurchases = sumToday(purchasesQ.data);
  const receivables = (customersQ.data || []).reduce(
    (s: number, c: any) => s + Math.max(0, Number(c.balance || 0)),
    0,
  );
  const payables = (suppliersQ.data || []).reduce(
    (s: number, x: any) => s + Math.max(0, Number(x.balance || 0)),
    0,
  );

  const hasActiveShift = !!statusQ.data?.activeShift;

  if (isLoading) {
    return <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center justify-between rounded-xl border px-4 py-3"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
      >
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Business day</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{todayBiz}</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: hasActiveShift ? 'var(--state-success-bg)' : 'var(--bg-surface-alt)',
            color: hasActiveShift ? 'var(--state-success-fg)' : 'var(--text-muted)',
          }}
        >
          {hasActiveShift ? 'Shift open' : 'No open shift'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Fuel sales today" value={inr(todayFuelSales)} sub={`${numberFmt(todayVolume, 2)} L`} tone="positive" />
        <Kpi label="Collections today" value={inr(todayCollections)} />
        <Kpi label="Expenses today" value={inr(todayExpenses)} />
        <Kpi label="Purchases today" value={inr(todayPurchases)} />
        <Kpi label="Receivables" value={inr(receivables)} sub="Customer dues" tone={receivables > 0 ? 'warning' : 'default'} />
        <Kpi label="Payables" value={inr(payables)} sub="Supplier dues" tone={payables > 0 ? 'warning' : 'default'} />
        <Kpi
          label="Cash variance today"
          value={inr(todayCashVariance)}
          sub={`${todayShifts.length} shift${todayShifts.length === 1 ? '' : 's'}`}
          tone={Math.abs(todayCashVariance) > 100 ? 'negative' : 'default'}
        />
      </div>
    </div>
  );
};
