import React, { useMemo, useState } from 'react';
import { useExpenses } from '../../query/hooks.js';
import { DataTable } from '../primitives/DataTable.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState } from '../../pump-ds/index.js';
import { Receipt } from 'lucide-react';
import { expenseColumns } from './columns.js';

export interface ExpenseAnalyticsProps {
  selectedStation: any | null;
}

/**
 * ExpenseAnalytics — the category-grouped "expense register": a business-date
 * range of expenses with KPIs, a by-category breakdown, and the full ledger.
 * Read-only, client-side over the cached expenses (VOIDED excluded from totals).
 * Mounted in BOTH the Expenses screen ("By Category" tab) and Reports ("Expense
 * Register" tab) so there is a single source of truth.
 */
export const ExpenseAnalytics: React.FC<ExpenseAnalyticsProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const { data: expenses, isLoading, error } = useExpenses();

  const inRange = useMemo(
    () =>
      (expenses || []).filter((e: any) => {
        const d = e.businessDate ?? e.shiftDate;
        return d && d >= range.from && d <= range.to;
      }),
    [expenses, range.from, range.to],
  );
  // VOIDED entries stay in the ledger (struck through) but don't count toward totals.
  const active = useMemo(() => inRange.filter((e: any) => e.status !== 'VOIDED'), [inRange]);

  const total = active.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    for (const e of active) {
      const name = e.categoryName || 'General';
      const c = m.get(name) || { name, total: 0, count: 0 };
      c.total += Number(e.amount || 0);
      c.count += 1;
      m.set(name, c);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [active]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DateRangeField value={range} onChange={setRange} clock={clock} />

      <KpiStrip columns="auto">
        <KpiTile dot="danger" valueTone="danger" label="Total Expenses" value={inr(total)} hint={`${range.from} → ${range.to}`} />
        <KpiTile dot="brand" label="Entries" value={String(active.length)} hint={inRange.length !== active.length ? `${inRange.length - active.length} voided` : 'in range'} />
        <KpiTile dot="neutral" label="Categories" value={String(byCategory.length)} hint="with spend" />
        <KpiTile dot="warning" label="Largest Category" value={byCategory[0] ? inr(byCategory[0].total) : inr(0)} hint={byCategory[0]?.name ?? '—'} />
      </KpiStrip>

      <Panel title="By category">
        {byCategory.length === 0 ? (
          <div style={{ padding: '12px' }}><EmptyState compact icon={<Receipt />} title="No expenses" description="No expenses in this date range." /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {byCategory.map((c) => {
              const pct = total > 0 ? (c.total / total) * 100 : 0;
              return (
                <div key={c.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
                      {c.name} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>· {c.count}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                      {inr(c.total)} <span style={{ color: 'var(--text-faint)' }}>· {pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface-alt)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-danger)', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel flush title="Entries">
        {isLoading ? (
          <div style={{ padding: '16px' }}><EmptyState compact icon={<Receipt />} title="Loading…" description="Fetching expenses." /></div>
        ) : inRange.length === 0 ? (
          <div style={{ padding: '12px' }}><EmptyState compact icon={<Receipt />} title="No entries" description="No expenses in this date range." /></div>
        ) : (
          <DataTable
            bare
            columns={expenseColumns}
            data={inRange}
            error={error as Error | null}
            emptyMessage="No expenses in this range."
            getRowId={(r: any) => r.id}
            initialSorting={[{ id: 'businessDate', desc: true }]}
          />
        )}
      </Panel>
    </div>
  );
};
