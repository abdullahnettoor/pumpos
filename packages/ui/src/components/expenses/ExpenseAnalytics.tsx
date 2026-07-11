import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useExpenses } from '../../query/hooks.js';
import { DataTable } from '../primitives/DataTable.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState } from '../../pump-ds/index.js';
import { Receipt } from 'lucide-react';

export interface ExpenseAnalyticsProps {
  selectedStation: any | null;
}

interface CategoryRow {
  name: string;
  total: number;
  count: number;
  share: number; // 0..100
}

/**
 * ExpenseAnalytics — the "by category" view: expenses over a business-date range
 * AGGREGATED per category (one row each: entries, total, share of spend). This
 * is deliberately NOT the per-entry ledger (that lives in the Expenses → Ledger
 * tab); it answers "where is the money going". Shared by the Expenses screen
 * "By Category" tab and the Reports "Expense Register" tab. VOIDED excluded.
 */
export const ExpenseAnalytics: React.FC<ExpenseAnalyticsProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const { data: expenses, isLoading } = useExpenses();

  const active = useMemo(
    () =>
      (expenses || []).filter((e: any) => {
        if (e.status === 'VOIDED') return false;
        const d = e.businessDate ?? e.shiftDate;
        return d && d >= range.from && d <= range.to;
      }),
    [expenses, range.from, range.to],
  );

  const total = active.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const byCategory = useMemo<CategoryRow[]>(() => {
    const m = new Map<string, CategoryRow>();
    for (const e of active) {
      const name = e.categoryName || 'General';
      const c = m.get(name) || { name, total: 0, count: 0, share: 0 };
      c.total += Number(e.amount || 0);
      c.count += 1;
      m.set(name, c);
    }
    const rows = [...m.values()];
    for (const r of rows) r.share = total > 0 ? (r.total / total) * 100 : 0;
    return rows.sort((a, b) => b.total - a.total);
  }, [active, total]);

  const columns = useMemo<ColumnDef<CategoryRow, any>[]>(
    () => [
      { accessorKey: 'name', header: 'Category', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{getValue() as string}</span> },
      { accessorKey: 'count', header: 'Entries', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{getValue() as number}</span> },
      { accessorKey: 'total', header: 'Total', cell: ({ getValue }) => <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-danger)' }}>{inr(getValue())}</span> },
      {
        accessorKey: 'share',
        header: 'Share',
        cell: ({ getValue }) => {
          const pct = getValue() as number;
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
              <span style={{ flex: 1, height: '6px', background: 'var(--bg-surface-alt)', borderRadius: '3px', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--brand-danger)', borderRadius: '3px' }} />
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', width: '34px', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DateRangeField value={range} onChange={setRange} clock={clock} />

      <KpiStrip columns="auto">
        <KpiTile dot="danger" valueTone="danger" label="Total Expenses" value={inr(total)} hint={`${range.from} → ${range.to}`} />
        <KpiTile dot="brand" label="Entries" value={String(active.length)} hint="in range" />
        <KpiTile dot="neutral" label="Categories" value={String(byCategory.length)} hint="with spend" />
        <KpiTile dot="warning" label="Largest Category" value={byCategory[0] ? inr(byCategory[0].total) : inr(0)} hint={byCategory[0]?.name ?? '—'} />
      </KpiStrip>

      <Panel flush title="Spend by category">
        {isLoading ? (
          <div style={{ padding: '16px' }}><EmptyState compact icon={<Receipt />} title="Loading…" description="Fetching expenses." /></div>
        ) : byCategory.length === 0 ? (
          <div style={{ padding: '12px' }}><EmptyState compact icon={<Receipt />} title="No expenses" description="No expenses in this date range." /></div>
        ) : (
          <DataTable
            bare
            columns={columns}
            data={byCategory}
            emptyMessage="No expenses in this range."
            getRowId={(r) => r.name}
            initialSorting={[{ id: 'total', desc: true }]}
          />
        )}
      </Panel>
    </div>
  );
};
