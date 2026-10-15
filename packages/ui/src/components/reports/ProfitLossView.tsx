import React, { useMemo, useState } from 'react';
import {
  useDailyDssrPreview,
  useProducts,
  useProfitLoss,
  useShiftStatus,
} from '../../query/hooks.js';
import { computeRange } from '../../pump-ds/date-range/index.js';
import type { DateRange } from '../../pump-ds/date-range/index.js';
import { MINUS, formatDate, formatMoney, formatTime } from '../../utils/format.js';
import { resolveBusinessDate } from '@pump/shared';
import type {
  ProfitLossDay,
  ProfitLossProductMargin,
  ProfitLossReport,
} from '../../services/cloud.js';
import {
  Chip,
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  Panel,
  SectionHeader,
  Sparkline,
  StatusChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { ReportRangeBar } from './ReportRangeBar.js';

export interface ProfitLossViewProps {
  selectedStation: any | null;
}

/**
 * A percentage to one decimal with the true minus (`12.5%`, `−3.0%`).
 * utils/format.ts has no percent format yet; this is the one P&L needs.
 */
const PERCENT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const formatPercent = (n: number): string =>
  `${n < 0 && Math.abs(n) >= 0.05 ? MINUS : ''}${PERCENT.format(Math.abs(n))}%`;

const EMPTY_TOTALS: ProfitLossReport['totals'] = {
  revenueFuel: 0,
  revenueMerch: 0,
  revenue: 0,
  cogsFuel: 0,
  cogsMerch: 0,
  cogs: 0,
  grossMargin: 0,
  expenses: 0,
  otherIncome: 0,
  netProfit: 0,
  marginPct: 0,
};

/** Money in plain ink; red only when the figure is a loss. */
const LossAware: React.FC<{ value: number }> = ({ value }) => (
  <span className={value < 0 ? 'text-danger-fg' : undefined}>{formatMoney(value)}</span>
);

const DAY_COLUMNS: TableColumn<ProfitLossDay>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (d) => d.date,
    width: '18%',
    cell: (d) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {formatDate(d.date)}
        {d.live && <StatusChip status="shift-live" size="md" />}
      </span>
    ),
  },
  { id: 'revenue', header: 'Revenue', kind: 'money', value: (d) => d.revenue },
  { id: 'cogs', header: 'COGS', kind: 'money', value: (d) => d.cogs },
  {
    id: 'grossMargin',
    header: 'Gross margin',
    kind: 'money',
    value: (d) => d.grossMargin,
    cell: (d) => <LossAware value={d.grossMargin} />,
  },
  { id: 'expenses', header: 'Expenses', kind: 'money', value: (d) => d.expenses },
  { id: 'otherIncome', header: 'Other income', kind: 'money', value: (d) => d.otherIncome },
  {
    id: 'netProfit',
    header: 'Net profit',
    kind: 'money',
    value: (d) => d.netProfit,
    cell: (d) => <LossAware value={d.netProfit} />,
  },
];

/** One line of the single-day statement. A deduction carries a negative value. */
interface StatementLine {
  label: string;
  value: number;
  /** A subtotal line (total revenue, gross margin). */
  subtotal?: boolean;
  /** Red when negative (a margin), never otherwise. */
  lossAware?: boolean;
  hint?: string;
}

/**
 * Period Profit & Loss. Every figure is composed server-side
 * (GET /dssr/profit-loss): gross margin by sales day, expenses and other
 * income by entry date (ADR 0005). This view only renders.
 *
 * Layout A (#531): the range bar drives the tiles, the trend and both tables.
 */
export const ProfitLossView: React.FC<ProfitLossViewProps> = ({ selectedStation }) => {
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const todayBiz = resolveBusinessDate({
    timeZone: clock.timeZone,
    dayStartsAt: clock.dayStartsAt,
  });
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));

  const isSingleDay = range.from === range.to;
  const todayInRange = todayBiz >= range.from && todayBiz <= range.to;

  const plQ = useProfitLoss(selectedStation?.id, range.from, range.to);
  const report = plQ.data;
  // Live-day context only: how many shifts today's provisional figure includes.
  const { data: preview } = useDailyDssrPreview(selectedStation?.id, todayBiz, {
    enabled: !!selectedStation?.id && todayInRange,
  } as any);
  const { data: shiftStatus } = useShiftStatus(selectedStation?.id, {
    lite: true,
    enabled: !!selectedStation?.id && todayInRange,
  });
  // Product units for the margin table's quantities (the P&L carries none).
  const { data: products } = useProducts();
  const hasOpenShift = !!shiftStatus?.activeShift;
  const closedShiftsToday = Number(preview?.snapshotData?.shiftsIncluded || 0);
  const liveAsOf = preview?.generatedAt ? formatTime(preview.generatedAt) : null;

  const days = useMemo(() => report?.days ?? [], [report]);
  const totals = useMemo(() => report?.totals ?? EMPTY_TOTALS, [report]);
  const single = isSingleDay ? (days[0] ?? null) : null;
  const productMargins = useMemo(() => report?.byProduct ?? [], [report]);

  // Chronological (oldest→newest) net-profit series for the trend sparkline.
  const trend = useMemo(() => [...days].reverse().map((d) => d.netProfit), [days]);

  const dayTotals = useMemo(
    () => ({
      label: 'Total',
      // The server's period totals: the figure the rows explain.
      values: {
        revenue: totals.revenue,
        cogs: totals.cogs,
        grossMargin: totals.grossMargin,
        expenses: totals.expenses,
        otherIncome: totals.otherIncome,
        netProfit: totals.netProfit,
      },
    }),
    [totals],
  );

  const productColumns = useMemo<TableColumn<ProfitLossProductMargin>[]>(() => {
    const unitById = new Map<string, string>(
      (products ?? []).map((p: any) => [String(p.id), String(p.unit ?? '')]),
    );
    return [
      {
        id: 'product',
        header: 'Product',
        kind: 'text',
        value: (p) => p.name,
        cell: (p) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-ink-strong">{p.name}</span>
            {/* A kind is a fact about the product, not a state: neutral. */}
            <Chip tone="neutral" size="md">
              {p.kind === 'fuel' ? 'Fuel' : 'Merch'}
            </Chip>
          </span>
        ),
      },
      {
        id: 'quantity',
        header: 'Qty',
        kind: 'qty',
        value: (p) => p.quantity,
        unit: (p) => unitById.get(p.productId) || (p.kind === 'fuel' ? 'L' : 'Nos'),
      },
      { id: 'revenue', header: 'Revenue', kind: 'money', value: (p) => p.revenue },
      { id: 'cogs', header: 'COGS', kind: 'money', value: (p) => p.cogs },
      {
        id: 'margin',
        header: 'Margin',
        kind: 'money',
        value: (p) => p.margin,
        cell: (p) => <LossAware value={p.margin} />,
      },
      {
        id: 'marginPct',
        header: 'Margin %',
        kind: 'text',
        value: (p) => p.marginPct,
        cell: (p) => (
          <span
            className={cn(
              'font-mono tabular-nums',
              p.marginPct < 0 ? 'text-danger-fg' : 'text-ink-muted',
            )}
          >
            {formatPercent(p.marginPct)}
          </span>
        ),
      },
    ];
  }, [products]);

  const statementLines: StatementLine[] = single
    ? [
        { label: 'Fuel revenue', value: single.revenueFuel },
        { label: 'Merchandise revenue', value: single.revenueMerch },
        { label: 'Total revenue', value: single.revenue, subtotal: true },
        { label: 'Fuel COGS', value: -single.cogsFuel },
        { label: 'Merchandise COGS', value: -single.cogsMerch },
        {
          label: 'Gross margin',
          value: single.grossMargin,
          subtotal: true,
          lossAware: true,
          hint: 'by sales day',
        },
        { label: 'Operating expenses', value: -single.expenses, hint: 'by entry date' },
        ...(single.otherIncome > 0
          ? [{ label: 'Other income', value: single.otherIncome, hint: 'by entry date' }]
          : []),
      ]
    : [];

  const noDays = (
    <div className="p-3">
      <EmptyState
        compact
        icon={<Icon name="trending-up" size="md" />}
        title="No profit data for this period"
        description="Generate the DSR for closed days to include their margin. Expenses and income appear by entry date."
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        info={
          <InfoTip label="About profit and loss" placement="bottom">
            Gross margin is by sales day, from each day's DSR at its own weighted-average cost (live
            for today). Expenses and other income are by entry date. Days without a generated DSR
            add no margin.
          </InfoTip>
        }
      />

      {/* Live "as-of" context: explain what the open day includes so fuel
          reading 0/partial before shift close is never mistaken for a bug. */}
      {todayInRange && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 text-[12px] leading-[1.45] text-ink-default"
        >
          <StatusChip status="shift-live" size="md" />
          <p className="m-0 pt-0.5">
            Today ({formatDate(todayBiz)}) is provisional{liveAsOf ? `, as of ${liveAsOf}` : ''}. It
            includes{' '}
            <strong className="font-semibold text-ink-strong">
              {closedShiftsToday} closed shift{closedShiftsToday === 1 ? '' : 's'}
            </strong>{' '}
            plus live merchandise.
            {hasOpenShift
              ? " Fuel from the currently open shift isn't counted until it closes (nozzle readings are taken at close)."
              : ' Fuel for a shift is counted once that shift closes.'}
          </p>
        </div>
      )}

      <DataSection title="Profit and loss totals" query={plQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile label="Revenue" scope="in-range" value={formatMoney(totals.revenue)} />
          <KpiTile
            label="Gross margin"
            scope="in-range"
            value={formatMoney(totals.grossMargin)}
            hint={`${formatPercent(totals.marginPct)} of revenue`}
          />
          <KpiTile
            label="Operating expenses"
            scope="in-range"
            value={formatMoney(totals.expenses)}
            hint={
              totals.otherIncome > 0
                ? `Other income ${formatMoney(totals.otherIncome)}`
                : 'by entry date'
            }
          />
          <KpiTile
            label="Net profit"
            scope="in-range"
            alert={totals.netProfit < 0 ? 'danger' : undefined}
            value={formatMoney(totals.netProfit)}
          />
        </KpiStrip>
      </DataSection>

      {/* Net-profit trend across the period (FB3). Only drawn once the report
          is in, so it shares the totals' loading and error state. */}
      {!isSingleDay && trend.length > 1 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Net profit trend" subtitle={`${trend.length} days`} />
          <Panel>
            <div className="flex flex-col gap-1.5">
              <Sparkline
                data={trend}
                tone={totals.netProfit < 0 ? 'danger' : 'brand'}
                fill
                height={64}
                className="w-full"
                aria-label="Daily net profit trend"
              />
              <div className="flex justify-between text-[12px] text-ink-faint">
                <span>{formatDate(days[days.length - 1]?.date)}</span>
                <span>Net profit per day</span>
                <span>{formatDate(days[0]?.date)}</span>
              </div>
            </div>
          </Panel>
        </section>
      )}

      {isSingleDay ? (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Statement"
            subtitle={
              single ? (
                <StatusChip status={single.live ? 'shift-live' : 'day-final'} size="md" />
              ) : undefined
            }
          />
          <DataSection
            title="Profit and loss statement"
            query={plQ}
            placeholderHeight={240}
            flush
            isEmpty={!single}
            empty={noDays}
          >
            <dl className="m-0 divide-y divide-border-soft text-[13px]">
              {statementLines.map((line) => (
                <div
                  key={line.label}
                  className={cn(
                    'flex items-baseline justify-between gap-4 px-4 py-2.5',
                    line.subtotal && 'bg-surface-alt font-semibold text-ink-strong',
                  )}
                >
                  <dt className="flex items-baseline gap-1.5">
                    {line.label}
                    {line.hint && (
                      <span className="text-[12px] font-normal text-ink-faint">{line.hint}</span>
                    )}
                  </dt>
                  <dd className="m-0 font-mono tabular-nums">
                    {line.lossAware ? <LossAware value={line.value} /> : formatMoney(line.value)}
                  </dd>
                </div>
              ))}
              {single && (
                <div className="flex items-baseline justify-between gap-4 bg-surface-alt px-4 py-3 font-semibold text-ink-strong">
                  <dt>Net profit</dt>
                  <dd className="m-0 font-mono text-[15px] tabular-nums">
                    <LossAware value={single.netProfit} />
                  </dd>
                </div>
              )}
            </dl>
          </DataSection>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Daily breakdown" />
          <DataSection
            title="Daily breakdown"
            query={plQ}
            placeholderHeight={200}
            flush
            isEmpty={days.length === 0}
            empty={noDays}
          >
            <InteractiveTable
              bare
              columns={DAY_COLUMNS}
              rows={days}
              rowKey={(d) => d.date}
              totalRow={dayTotals}
              title="Daily breakdown"
            />
          </DataSection>
        </section>
      )}

      {/* Per-product margin (FB3): which products actually make money. */}
      {(plQ.isLoading || plQ.isError || productMargins.length > 0) && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Margin by product" />
          <DataSection title="Margin by product" query={plQ} placeholderHeight={160} flush>
            <InteractiveTable
              bare
              columns={productColumns}
              rows={productMargins}
              rowKey={(p) => p.productId}
              totalRow
              title="Margin by product"
            />
          </DataSection>
        </section>
      )}
    </div>
  );
};
