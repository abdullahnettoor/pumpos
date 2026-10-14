import React, { useMemo, useState } from 'react';
import type { ReceivablesSummary } from '@pump/shared';
import {
  DataSection,
  DateRangeMenu,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  computeRange,
  type DateRange,
  type RangeClock,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildCreditSaleColumns, type CreditSaleRow } from './columns.js';
import { countOf, inWindow, sumAmounts } from './ledgerWindow.js';

interface QueryOf<T> extends SectionQuery {
  data?: T;
}

export interface CreditSalesTabProps {
  creditSalesQ: QueryOf<CreditSaleRow[]>;
  /** Absent for a Role that may not read receivables. */
  receivablesQ: QueryOf<ReceivablesSummary> | null;
  /** The station clock: a credit sale sits on its Business Day (Day Start applies). */
  clock: RangeClock;
}

const sales = (n: number) => countOf(n, 'sale', 'sales');

/**
 * Customers › Credit sales: a ledger, layout B (#567). Credit sales are
 * receivables on the Business Day they were sold. Fixed tiles on top; the
 * range, search and info tip sit in the ledger's section header.
 */
export const CreditSalesTab: React.FC<CreditSalesTabProps> = ({
  creditSalesQ,
  receivablesQ,
  clock,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [search, setSearch] = useState('');
  const all = useMemo(() => creditSalesQ.data ?? [], [creditSalesQ.data]);
  const columns = useMemo(() => buildCreditSaleColumns(), []);

  const kpis = useMemo(() => {
    const today = computeRange('today', clock);
    const month = computeRange('this-month', clock);
    const todayRows = all.filter((s) => inWindow(s.businessDate, today));
    const monthRows = all.filter((s) => inWindow(s.businessDate, month));
    return {
      today: sumAmounts(todayRows),
      todayCount: todayRows.length,
      month: sumAmounts(monthRows),
      monthCount: monthRows.length,
      monthFrom: month.from,
      customers: new Set(monthRows.map((s) => s.customerId).filter(Boolean)).size,
    };
  }, [all, clock]);

  // Newest first, as the server sends them.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (!inWindow(s.businessDate, range)) return false;
      if (!q) return true;
      return [s.customerName, s.vehicleReg, s.productName, s.notes].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      );
    });
  }, [all, range, search]);

  const summary = receivablesQ?.data;

  return (
    <div className="flex flex-col gap-4">
      <DataSection
        title="credit totals"
        query={[creditSalesQ, ...(receivablesQ ? [receivablesQ] : [])]}
        shape="cards"
        placeholderHeight={90}
      >
        <KpiStrip columns="auto">
          <KpiTile
            label="Credit issued today"
            scope="today"
            value={formatMoney(kpis.today)}
            hint={sales(kpis.todayCount)}
          />
          <KpiTile
            label="Credit this month"
            scope={{ month: kpis.monthFrom }}
            value={formatMoney(kpis.month)}
            hint={sales(kpis.monthCount)}
          />
          <KpiTile
            label="Customers on credit"
            scope={{ month: kpis.monthFrom }}
            value={String(kpis.customers)}
          />
          {summary && (
            <KpiTile
              label="Receivable"
              scope="now"
              value={formatMoney(summary.total)}
              hint={`${countOf(summary.customerCount, 'customer', 'customers')} owe`}
            />
          )}
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Credit sales"
          subtitle={creditSalesQ.data ? sales(rows.length) : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={clock}
                align="end"
                aria-label="Credit sales period"
              />
            ),
            search: (
              <div className="w-[240px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search customer / vehicle / product…"
                />
              </div>
            ),
            info: (
              <InfoTip label="About credit sales" placement="bottom">
                Credit sales are receivables: fuel and merchandise on credit. They never touch the
                drawer; record them from the shift handover.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="credit sales"
          query={creditSalesQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="credit-card" size="md" />}
                title={all.length === 0 ? 'No credit sales yet' : 'No matching credit sales'}
                description={
                  all.length === 0
                    ? 'Fuel-on-credit and merchandise-on-credit sales appear here.'
                    : 'Adjust the range or search.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            totalRow
            title="credit sales"
          />
        </DataSection>
      </section>
    </div>
  );
};
