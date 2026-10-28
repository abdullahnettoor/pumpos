import React, { useMemo, useState } from 'react';
import { useExpenses, useIncome } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import { FALLBACK_CATEGORY } from '../categories/categoryRecordColumns.js';
import {
  ControlBar,
  DataSection,
  DateRangeMenu,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
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
    withAmount: 'with spend',
    section: 'Spend by category',
    empty: 'No expenses',
    emptyRange: 'No expenses in this date range.',
    icon: 'receipt' as IconName,
  },
  income: {
    noun: 'income',
    withAmount: 'with income',
    section: 'Income by category',
    empty: 'No income',
    emptyRange: 'No income in this date range.',
    icon: 'arrow-down' as IconName,
  },
};

/** Calendar days from `from` to `to`, both counted (`YYYY-MM-DD`). */
function daysInRange({ from, to }: DateRange): number {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.max(1, Math.round((day(to) - day(from)) / 86_400_000) + 1);
}

interface CategoryRow {
  name: string;
  total: number;
  count: number;
  share: number; // 0..100
}

/**
 * The category's share of the total: a brand bar, then the percent. Ordinary
 * money is never red or green; colour is kept for problems.
 */
const ShareCell: React.FC<{ pct: number }> = ({ pct }) => (
  <span className="flex min-w-[140px] items-center gap-2">
    <svg className="h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
      <rect width="100%" height="100%" className="fill-surface-alt" />
      <rect width={`${pct}%`} height="100%" className="fill-brand" />
    </svg>
    <span className="w-[34px] text-right font-mono text-[12px] text-ink-muted">
      {Math.round(pct)}%
    </span>
  </span>
);

/** One row per category: entries, total, share. Plain figures, a brand bar. */
const COLUMNS: TableColumn<CategoryRow>[] = [
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
    cell: (r) => <span className="text-ink-strong">{formatMoney(r.total)}</span>,
    width: '20%',
  },
  {
    id: 'share',
    header: 'Share',
    kind: 'text',
    value: (r) => r.share,
    cell: (r) => <ShareCell pct={r.share} />,
    width: '32%',
  },
];

/**
 * CategoryAnalytics — the "by category" view: expenses over an entry-date range
 * AGGREGATED per category (one row each: entries, total, share of spend). This
 * is deliberately NOT the per-entry ledger (that lives in the Expenses → Expenses
 * tab); it answers "where is the money going". Shared by the Expenses screen
 * "By category" tab and the Reports "Expense register". The Income screen's
 * "By category" tab reads the same view with `kind="income"`. VOIDED excluded.
 *
 * Layout A (#567): one control bar with the range menu drives the tiles and
 * the table below it. The range menu right above names the period, so the
 * tiles carry no period label (#604). A tile never repeats the
 * table's total (the total row carries it), so the first tile is the average
 * per day over the range.
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
      const name = e.categoryName || FALLBACK_CATEGORY[kind];
      const c = m.get(name) || { name, total: 0, count: 0, share: 0 };
      c.total += Number(e.amount || 0);
      c.count += 1;
      m.set(name, c);
    }
    const rows = [...m.values()];
    for (const r of rows) r.share = total > 0 ? (r.total / total) * 100 : 0;
    return rows.sort((a, b) => b.total - a.total);
  }, [active, total, kind]);

  const days = daysInRange(range);
  const largest = byCategory[0];

  return (
    <div className="flex flex-col gap-4">
      <ControlBar
        range={
          <DateRangeMenu
            value={range}
            onChange={setRange}
            clock={clock}
            aria-label={`${copy.section} period`}
          />
        }
      />

      <DataSection title={`${kind} totals`} query={recordsQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Average per day"
            value={formatMoney(total / days)}
            hint={`over ${days} ${days === 1 ? 'day' : 'days'}`}
          />
          <KpiTile label="Entries" value={String(active.length)} />
          <KpiTile label="Categories" value={String(byCategory.length)} hint={copy.withAmount} />
          <KpiTile
            label="Largest category"
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
            columns={COLUMNS}
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
