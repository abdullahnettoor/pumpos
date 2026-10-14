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
  type FilterChipOption,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { countOf, type EntryClock } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildCustomerColumns, type CollectionRow } from './columns.js';
import {
  OVERDUE_AFTER_DAYS,
  buildStandings,
  filterStandings,
  overLimitKpi,
  receivableKpis,
  type CustomerFilter,
  type CustomerRow,
} from './customerStanding.js';
import { collectionFigures, type QueryOf } from './ledgerKpis.js';
import { TileSection } from './TileSection.js';

export interface CustomerListTabProps {
  customersQ: QueryOf<CustomerRow[]>;
  /** Absent for a Role that may not read receivables. */
  receivablesQ: QueryOf<ReceivablesSummary> | null;
  collectionsQ: QueryOf<CollectionRow[]>;
  entryClock: EntryClock;
  onOpenStatement: (c: CustomerRow) => void;
  onEdit: (c: CustomerRow) => void;
}

const customers = (n: number) => countOf(n, 'customer', 'customers');

/**
 * Customers › Customers: a balance list, layout B (#567). Tiles on top, each
 * naming its period (Now, the month) and each waiting only on what it reads;
 * the row filters and search sit in the table's section header. Receivable
 * tiles are the server's (`/reports/receivables`).
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
  const anyPrepaid = all.some((c) => c.isPrepaid);
  const columns = useMemo(
    () => buildCustomerColumns(onOpenStatement, onEdit, anyPrepaid),
    [onOpenStatement, onEdit, anyPrepaid],
  );
  const collected = useMemo(
    () => collectionFigures(collectionsQ.data ?? [], entryClock),
    [collectionsQ.data, entryClock],
  );
  const kpis = summary ? receivableKpis(summary) : null;
  const overLimit = overLimitKpi(standings);
  const filtered = filter !== 'all' || !!search.trim();
  // Over limit reads the rows. It waits for the summary while it loads (so the
  // figure does not jump), but a failed summary leaves it on stored balances.
  const overLimitQueries =
    receivablesQ && !receivablesQ.isError ? [customersQ, receivablesQ] : customersQ;

  // Unfiltered, the Receivable tile carries the total: no total row. A filtered
  // list totals the rows shown, and says when it leaves advances out. Without a
  // summary (Staff, or a failed request) there is no total at all.
  const totalRow = useMemo<TotalRow | undefined>(() => {
    if (!summary || !filtered) return undefined;
    const advances = rows.some((r) => r.standing.advance > 0);
    return { label: `Total of ${rows.length} shown${advances ? ', excl. advances' : ''}` };
  }, [summary, filtered, rows]);

  const options = useMemo<FilterChipOption<CustomerFilter>[]>(() => {
    const c = standings.counts;
    return [
      { value: 'all', label: 'All', count: c.all },
      ...(standings.fromServer
        ? [{ value: 'overdue', label: 'Overdue', count: c.overdue, status: 'overdue' } as const]
        : []),
      { value: 'over-limit', label: 'Over limit', count: c['over-limit'], status: 'over-limit' },
      { value: 'paid-up', label: 'Paid up', count: c['paid-up'] },
      // End-of-day settlement customers with something to settle (the old "EOD due" toggle).
      ...(c['eod-due'] > 0
        ? [{ value: 'eod-due', label: 'EOD due', count: c['eod-due'] } as const]
        : []),
    ];
  }, [standings]);

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip columns="auto">
        {receivablesQ && (
          <TileSection title="receivable" query={receivablesQ}>
            {kpis && (
              <KpiTile
                label="Receivable"
                scope="now"
                value={formatMoney(kpis.total)}
                hint={`${customers(kpis.owing)} owe`}
              />
            )}
          </TileSection>
        )}
        {receivablesQ && (
          <TileSection title="overdue" query={receivablesQ}>
            {kpis && (
              <KpiTile
                label="Overdue"
                scope="now"
                alert={kpis.overdue > 0 ? 'warning' : undefined}
                value={formatMoney(kpis.overdue)}
                hint={
                  kpis.overdueCustomers > 0
                    ? `${customers(kpis.overdueCustomers)}, oldest ${kpis.oldestOverdueDays} days`
                    : `Nothing past ${OVERDUE_AFTER_DAYS} days`
                }
              />
            )}
          </TileSection>
        )}
        <TileSection title="over limit" query={overLimitQueries}>
          <KpiTile
            label="Over credit limit"
            scope="now"
            alert={overLimit.count > 0 ? 'danger' : undefined}
            value={String(overLimit.count)}
            hint={
              overLimit.worst
                ? `${overLimit.worst.name} · ${formatMoney(overLimit.worst.by)} over`
                : 'All within limit'
            }
          />
        </TileSection>
        <TileSection title="collected" query={collectionsQ}>
          <KpiTile
            label="Collected"
            scope={{ month: collected.monthFrom }}
            value={formatMoney(collected.month)}
            hint={`${formatMoney(collected.today)} today`}
          />
        </TileSection>
      </KpiStrip>

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
                Receivable is what a customer owes now, from their ledger. The Overdue tile counts
                only the unpaid credit sales older than {OVERDUE_AFTER_DAYS} days; the Overdue
                filter lists the customers who have any, with their whole receivable. Over limit:
                owes more than their credit limit. Money held in advance is not a receivable.
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
