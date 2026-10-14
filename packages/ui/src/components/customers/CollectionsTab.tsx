import React, { useMemo, useState } from 'react';
import type { ReceivablesSummary } from '@pump/shared';
import {
  DataSection,
  DateRangeMenu,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  computeRange,
  type DateRange,
  type FilterChipOption,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { countOf, inWindow, type EntryClock } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildCollectionColumns, methodLabel, type CollectionRow } from './columns.js';
import { collectionFigures, countByMethod, type QueryOf } from './ledgerKpis.js';
import { TileSection } from './TileSection.js';

export interface CollectionsTabProps {
  collectionsQ: QueryOf<CollectionRow[]>;
  /** Absent for a Role that may not read receivables. */
  receivablesQ: QueryOf<ReceivablesSummary> | null;
  entryClock: EntryClock;
}

const METHODS = ['Cash', 'Card', 'UPI', 'BankTransfer'] as const;
const entries = (n: number) => countOf(n, 'entry', 'entries');

/**
 * Customers › Collections: a ledger, layout B (#567). Collections are Office
 * Records dated by entry date (ADR 0005), so every window here reads the
 * entry date. Fixed tiles on top; the range, search, method and info tip sit
 * in the ledger's section header and filter only the table.
 */
export const CollectionsTab: React.FC<CollectionsTabProps> = ({
  collectionsQ,
  receivablesQ,
  entryClock,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const all = useMemo(() => collectionsQ.data ?? [], [collectionsQ.data]);
  const columns = useMemo(() => buildCollectionColumns(), []);

  const kpis = useMemo(() => collectionFigures(all, entryClock), [all, entryClock]);

  // Range and search first; the method chips count what each would show.
  const inView = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (!inWindow(c.entryDate, range)) return false;
      if (!q) return true;
      return [c.customerName, c.notes].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [all, range, search]);
  const rows = useMemo(
    () => (method === 'all' ? inView : inView.filter((c) => c.paymentMethod === method)),
    [inView, method],
  );
  const methodOptions = useMemo<FilterChipOption<string>[]>(() => {
    const counts = countByMethod(inView);
    return [
      { value: 'all', label: 'All', count: inView.length },
      ...METHODS.map((m) => ({ value: m, label: methodLabel(m), count: counts[m] ?? 0 })),
    ];
  }, [inView]);

  const summary = receivablesQ?.data;

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip columns="auto">
        <TileSection title="collected today" query={collectionsQ}>
          <KpiTile
            label="Collected today"
            scope="today"
            value={formatMoney(kpis.today)}
            hint={entries(kpis.todayCount)}
          />
        </TileSection>
        <TileSection title="collected this month" query={collectionsQ}>
          <KpiTile
            label="Collected this month"
            scope={{ month: kpis.monthFrom }}
            value={formatMoney(kpis.month)}
            hint={entries(kpis.monthCount)}
          />
        </TileSection>
        <TileSection title="customers paid" query={collectionsQ}>
          <KpiTile label="Customers paid today" scope="today" value={String(kpis.todayCustomers)} />
        </TileSection>
        {receivablesQ && (
          <TileSection title="receivable" query={receivablesQ}>
            {summary && (
              <KpiTile
                label="Receivable"
                scope="now"
                value={formatMoney(summary.total)}
                hint={`${countOf(summary.customerCount, 'customer', 'customers')} owe`}
              />
            )}
          </TileSection>
        )}
      </KpiStrip>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Collections"
          subtitle={collectionsQ.data ? entries(rows.length) : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={entryClock}
                align="end"
                aria-label="Collections period"
              />
            ),
            search: (
              <div className="w-[200px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search customer / note…"
                />
              </div>
            ),
            filters: collectionsQ.data && (
              <FilterChips
                aria-label="Filter by method"
                options={methodOptions}
                value={method}
                onChange={setMethod}
              />
            ),
            info: (
              <InfoTip label="Where do collections post?" placement="bottom">
                Collections are office entries: they post to the account you choose on the entry
                date, not to a shift.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="collections"
          query={collectionsQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="wallet" size="md" />}
                title={all.length === 0 ? 'No collections yet' : 'No matching collections'}
                description={
                  all.length === 0
                    ? 'Record a collection to see it here.'
                    : 'Adjust the range, search, or method filter.'
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
            title="collections"
          />
        </DataSection>
      </section>
    </div>
  );
};
