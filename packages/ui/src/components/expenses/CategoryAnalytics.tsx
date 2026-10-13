import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useExpenses, useIncome } from '../../query/hooks.js';
import { DataTable } from '../primitives/DataTable.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState, Icon } from '../../pump-ds/index.js';

export interface CategoryAnalyticsProps {
  selectedStation: any | null;
  /** Which office record to break down. Income reuses the same view (#540). */
  kind?: 'expense' | 'income';
}

const COPY = {
  expense: {
    total: 'Total expenses',
    withAmount: 'with spend',
    panel: 'Spend by category',
    loading: 'Fetching expenses.',
    empty: 'No expenses',
    emptyRange: 'No expenses in this date range.',
    emptyTable: 'No expenses in this range.',
    tone: 'danger' as const,
    color: 'var(--brand-danger)',
    icon: 'receipt' as const,
  },
  income: {
    total: 'Total income',
    withAmount: 'with income',
    panel: 'Income by category',
    loading: 'Fetching income.',
    empty: 'No income',
    emptyRange: 'No income in this date range.',
    emptyTable: 'No income in this range.',
    tone: 'success' as const,
    color: 'var(--state-success-fg)',
    icon: 'arrow-down' as const,
  },
};

interface CategoryRow {
  name: string;
  total: number;
  count: number;
  share: number; // 0..100
}

/**
 * CategoryAnalytics — the "by category" view: expenses over an entry-date range
 * AGGREGATED per category (one row each: entries, total, share of spend). This
 * is deliberately NOT the per-entry ledger (that lives in the Expenses → Expenses
 * tab); it answers "where is the money going". Shared by the Expenses screen
 * "By category" tab and the Reports "Expense register". The Income screen's
 * "By category" tab reads the same view with `kind="income"`. VOIDED excluded.
 */
export const CategoryAnalytics: React.FC<CategoryAnalyticsProps> = ({
  selectedStation,
  kind = 'expense',
}) => {
  const copy = COPY[kind];
  const s = selectedStation?.settings || {};
  // Office records are dated by entry date (station calendar date), not the sales day.
  const clock = { timeZone: s.timezone };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const expensesQ = useExpenses({ enabled: kind === 'expense' });
  const incomeQ = useIncome(
    { stationId: selectedStation?.id ?? undefined },
    { enabled: kind === 'income' },
  );
  const { data: expenses, isLoading } = kind === 'income' ? incomeQ : expensesQ;

  const active = useMemo(
    () =>
      (expenses || []).filter((e: any) => {
        if (e.status === 'VOIDED') return false;
        const d = e.entryDate;
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
      {
        accessorKey: 'name',
        header: 'Category',
        cell: ({ getValue }) => (
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'count',
        header: 'Entries',
        cell: ({ getValue }) => (
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {getValue() as number}
          </span>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ getValue }) => (
          <span
            style={{
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: copy.color,
            }}
          >
            {inr(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'share',
        header: 'Share',
        cell: ({ getValue }) => {
          const pct = getValue() as number;
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
              <span
                style={{
                  flex: 1,
                  height: '6px',
                  background: 'var(--bg-surface-alt)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${pct}%`,
                    height: '100%',
                    background: copy.color,
                    borderRadius: '3px',
                  }}
                />
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  width: '34px',
                  textAlign: 'right',
                }}
              >
                {pct.toFixed(0)}%
              </span>
            </span>
          );
        },
      },
    ],
    [copy.color],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />

      <KpiStrip columns="auto">
        <KpiTile
          dot={copy.tone}
          valueTone={copy.tone}
          label={copy.total}
          value={inr(total)}
          hint={`${range.from} → ${range.to}`}
        />
        <KpiTile dot="brand" label="Entries" value={String(active.length)} hint="in range" />
        <KpiTile
          dot="neutral"
          label="Categories"
          value={String(byCategory.length)}
          hint={copy.withAmount}
        />
        <KpiTile
          dot="warning"
          label="Largest Category"
          value={byCategory[0] ? inr(byCategory[0].total) : inr(0)}
          hint={byCategory[0]?.name ?? '—'}
        />
      </KpiStrip>

      <Panel flush title={copy.panel}>
        {isLoading ? (
          <div style={{ padding: '16px' }}>
            <EmptyState
              compact
              icon={<Icon name={copy.icon} size="md" />}
              title="Loading…"
              description={copy.loading}
            />
          </div>
        ) : byCategory.length === 0 ? (
          <div style={{ padding: '12px' }}>
            <EmptyState
              compact
              icon={<Icon name={copy.icon} size="md" />}
              title={copy.empty}
              description={copy.emptyRange}
            />
          </div>
        ) : (
          <DataTable
            bare
            columns={columns}
            data={byCategory}
            emptyMessage={copy.emptyTable}
            getRowId={(r) => r.name}
            initialSorting={[{ id: 'total', desc: true }]}
          />
        )}
      </Panel>
    </div>
  );
};
