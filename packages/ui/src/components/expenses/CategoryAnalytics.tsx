import React, { useMemo, useState } from 'react';
import { useExpenses, useIncome } from '../../query/hooks.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { formatMoney } from '../../utils/format.js';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  type IconName,
  type TableColumn,
} from '../../pump-ds/index.js';

export interface CategoryAnalyticsProps {
  selectedStation: any | null;
  /** Which office record to break down. Income reuses the same view (#540). */
  kind?: 'expense' | 'income';
}

const COPY = {
  expense: {
    noun: 'expenses',
    total: 'Total expenses',
    withAmount: 'with spend',
    section: 'Spend by category',
    empty: 'No expenses',
    emptyRange: 'No expenses in this date range.',
    tone: 'danger' as const,
    amount: 'text-danger-fg',
    bar: 'fill-danger-fg',
    icon: 'receipt' as IconName,
  },
  income: {
    noun: 'income',
    total: 'Total income',
    withAmount: 'with income',
    section: 'Income by category',
    empty: 'No income',
    emptyRange: 'No income in this date range.',
    tone: 'success' as const,
    amount: 'text-success-fg',
    bar: 'fill-success-fg',
    icon: 'arrow-down' as IconName,
  },
};

interface CategoryRow {
  name: string;
  total: number;
  count: number;
  share: number; // 0..100
}

/** The category's share of the total: a bar in the kind's tone, then the percent. */
const ShareCell: React.FC<{ pct: number; fill: string }> = ({ pct, fill }) => (
  <span className="flex min-w-[140px] items-center gap-2">
    <svg className="h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
      <rect width="100%" height="100%" className="fill-surface-alt" />
      <rect width={`${pct}%`} height="100%" className={fill} />
    </svg>
    <span className="w-[34px] text-right font-mono text-[12px] text-ink-muted">
      {Math.round(pct)}%
    </span>
  </span>
);

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
  const timeZone = selectedStation?.settings?.timezone;
  // Office records are dated by entry date (station calendar date), not the sales day.
  const clock = useMemo(() => ({ timeZone }), [timeZone]);
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const expensesQ = useExpenses({ enabled: kind === 'expense' });
  const incomeQ = useIncome(
    { stationId: selectedStation?.id ?? undefined },
    { enabled: kind === 'income' },
  );
  const recordsQ = kind === 'income' ? incomeQ : expensesQ;

  const active = useMemo(
    () =>
      (recordsQ.data || []).filter((e: any) => {
        if (e.status === 'VOIDED') return false;
        const d = e.entryDate;
        return d && d >= range.from && d <= range.to;
      }),
    [recordsQ.data, range.from, range.to],
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

  const columns = useMemo<TableColumn<CategoryRow>[]>(
    () => [
      { id: 'name', header: 'Category', kind: 'text', emphasis: true, value: (r) => r.name },
      {
        id: 'count',
        header: 'Entries',
        kind: 'qty',
        total: false,
        value: (r) => r.count,
        cell: (r) => <span className="text-ink-muted">{r.count}</span>,
        width: '12%',
      },
      {
        id: 'total',
        header: 'Total',
        kind: 'money',
        value: (r) => r.total,
        cell: (r) => <span className={copy.amount}>{formatMoney(r.total)}</span>,
        width: '20%',
      },
      {
        id: 'share',
        header: 'Share',
        kind: 'text',
        value: (r) => r.share,
        cell: (r) => <ShareCell pct={r.share} fill={copy.bar} />,
        width: '32%',
      },
    ],
    [copy],
  );

  const largest = byCategory[0];

  return (
    <div className="flex flex-col gap-4">
      <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />

      <DataSection title={`${kind} totals`} query={recordsQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            dot={copy.tone}
            valueTone={copy.tone}
            label={copy.total}
            value={formatMoney(total)}
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
            value={formatMoney(largest?.total ?? 0)}
            hint={largest?.name ?? '—'}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title={copy.section} />
        <DataSection
          title={copy.noun}
          query={recordsQ}
          placeholderHeight={200}
          flush
          isEmpty={byCategory.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name={copy.icon} size="md" />}
                title={copy.empty}
                description={copy.emptyRange}
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={byCategory}
            rowKey={(r) => r.name}
            totalRow
            title={copy.noun}
          />
        </DataSection>
      </section>
    </div>
  );
};
