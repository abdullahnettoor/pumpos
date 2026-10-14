import React, { useMemo, useState } from 'react';
import type { ReceivablesSummary } from '@pump/shared';
import {
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  computeRange,
  type FilterChipOption,
  type SectionQuery,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildCustomerColumns, type CollectionRow } from './columns.js';
import {
  buildStandings,
  filterStandings,
  receivableKpis,
  type CustomerFilter,
  type CustomerRow,
} from './customerStanding.js';
import { sumAmounts, inWindow, type EntryClock } from './ledgerWindow.js';

interface QueryOf<T> extends SectionQuery {
  data?: T;
}

export interface CustomerListTabProps {
  customersQ: QueryOf<CustomerRow[]>;
  /** Absent for a Role that may not read receivables. */
  receivablesQ: QueryOf<ReceivablesSummary> | null;
  collectionsQ: QueryOf<CollectionRow[]>;
  entryClock: EntryClock;
  onOpenStatement: (c: CustomerRow) => void;
  onEdit: (c: CustomerRow) => void;
}

const customers = (n: number) => `${n} ${n === 1 ? 'customer' : 'customers'}`;

/**
 * Customers › Customers: a balance list, layout B (#567). Tiles on top, each
 * naming its period (Now, the month); the row filters and search sit in the
 * table's section header. Receivable figures are the server's
 * (`/reports/receivables`); the list adds up no `currentBalance`.
 */
export const CustomerListTab: React.FC<CustomerListTabProps> = ({
  customersQ,
  receivablesQ,
  collectionsQ,
  entryClock,
  onOpenStatement,
  onEdit,
}) => {
  const [filter, setFilter] = useState<CustomerFilter>('all');
  const [search, setSearch] = useState('');

  const all = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const summary = receivablesQ?.data;
  const standings = useMemo(() => buildStandings(all, summary), [all, summary]);
  const rows = useMemo(
    () => filterStandings(standings.rows, filter, search),
    [standings, filter, search],
  );
  const anyPrepaid = all.some((c: any) => c.isPrepaid);
  const columns = useMemo(
    () => buildCustomerColumns(onOpenStatement, onEdit, anyPrepaid),
    [onOpenStatement, onEdit, anyPrepaid],
  );

  const collected = useMemo(() => {
    const list = collectionsQ.data ?? [];
    const today = computeRange('today', entryClock);
    const month = computeRange('this-month', entryClock);
    return {
      month: sumAmounts(list.filter((c) => inWindow(c.entryDate, month))),
      today: sumAmounts(list.filter((c) => inWindow(c.entryDate, today))),
      monthFrom: month.from,
    };
  }, [collectionsQ.data, entryClock]);

  // The total row adds up the server's receivables of the rows shown. Unfiltered,
  // it is the summary's own total. No summary, no total: never Σ currentBalance.
  const totalRow = useMemo<TotalRow | undefined>(() => {
    if (!summary) return undefined;
    const advances = rows.some((r) => r.standing.advance > 0);
    const unfiltered = filter === 'all' && !search.trim();
    return {
      label: advances ? 'Total excl. advances' : 'Total',
      values: unfiltered ? { receivable: summary.total } : undefined,
    };
  }, [summary, rows, filter, search]);

  const options = useMemo<FilterChipOption<CustomerFilter>[]>(() => {
    const c = standings.counts;
    return [
      { value: 'all', label: 'All', count: c.all },
      ...(standings.fromServer
        ? [{ value: 'overdue', label: 'Overdue', count: c.overdue, status: 'overdue' } as const]
        : []),
      { value: 'over-limit', label: 'Over limit', count: c['over-limit'], status: 'over-limit' },
      { value: 'paid-up', label: 'Paid up', count: c['paid-up'] },
      // End-of-day settlement customers with something to settle (kept from the old "EOD due" toggle).
      ...(c['eod-due'] > 0
        ? [{ value: 'eod-due', label: 'EOD due', count: c['eod-due'] } as const]
        : []),
    ];
  }, [standings]);

  const kpis = summary ? receivableKpis(summary, standings) : null;
  const overLimit = kpis?.overLimit ?? standings.counts['over-limit'];
  const tileQueries = [customersQ, collectionsQ, ...(receivablesQ ? [receivablesQ] : [])];
  const filtered = filter !== 'all' || !!search.trim();

  return (
    <div className="flex flex-col gap-4">
      <DataSection title="customer totals" query={tileQueries} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          {kpis && (
            <>
              <KpiTile
                label="Receivable"
                scope="now"
                value={formatMoney(kpis.total)}
                hint={`${customers(kpis.owing)} owe`}
              />
              <KpiTile
                label="Overdue"
                scope="now"
                alert={kpis.overdue > 0 ? 'warning' : undefined}
                value={formatMoney(kpis.overdue)}
                hint={
                  kpis.overdueCustomers > 0
                    ? `${customers(kpis.overdueCustomers)}, oldest ${kpis.oldestOverdueDays} days`
                    : 'Nothing past 30 days'
                }
              />
            </>
          )}
          <KpiTile
            label="Over credit limit"
            scope="now"
            alert={overLimit > 0 ? 'danger' : undefined}
            value={String(overLimit)}
            hint={
              kpis?.worstOverLimit
                ? `${kpis.worstOverLimit.name} · ${formatMoney(kpis.worstOverLimit.by)} over`
                : overLimit > 0
                  ? customers(overLimit)
                  : 'All within limit'
            }
          />
          <KpiTile
            label="Collected"
            scope={{ month: collected.monthFrom }}
            value={formatMoney(collected.month)}
            hint={`${formatMoney(collected.today)} today`}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Credit customers"
          subtitle={
            customersQ.data
              ? filtered
                ? `${rows.length} of ${all.length}`
                : customers(all.length)
              : undefined
          }
          controls={{
            filters: customersQ.data && (
              <FilterChips
                aria-label="Show customers"
                options={options}
                value={filter}
                onChange={setFilter}
              />
            ),
            search: (
              <div className="w-[220px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name / phone / GSTIN…"
                />
              </div>
            ),
            info: (
              <InfoTip label="About receivables" placement="bottom">
                Receivable is what a customer owes now, from their ledger. Overdue: the oldest
                unpaid credit sale is more than 30 days old. Over limit: owes more than their credit
                limit. Money held in advance is not a receivable.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="customers"
          query={customersQ}
          placeholderHeight={320}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="users" size="md" />}
                title={all.length === 0 ? 'No customers yet' : 'No matching customers'}
                description={
                  all.length === 0
                    ? 'Add a credit or fleet customer to start selling on credit.'
                    : 'Choose another filter or clear the search.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(r) => r.customer.id}
            totalRow={totalRow}
            title="customers"
          />
        </DataSection>
      </section>
    </div>
  );
};
