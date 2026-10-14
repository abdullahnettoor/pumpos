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
  Select,
  computeRange,
  type DateRange,
  type SectionQuery,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildCollectionColumns, methodLabel, type CollectionRow } from './columns.js';
import { countOf, inWindow, sumAmounts, type EntryClock } from './ledgerWindow.js';

interface QueryOf<T> extends SectionQuery {
  data?: T;
}

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
  const [method, setMethod] = useState('');
  const all = useMemo(() => collectionsQ.data ?? [], [collectionsQ.data]);
  const columns = useMemo(() => buildCollectionColumns(), []);

  const kpis = useMemo(() => {
    const today = computeRange('today', entryClock);
    const month = computeRange('this-month', entryClock);
    const todayRows = all.filter((c) => inWindow(c.entryDate, today));
    const monthRows = all.filter((c) => inWindow(c.entryDate, month));
    return {
      today: sumAmounts(todayRows),
      todayCount: todayRows.length,
      month: sumAmounts(monthRows),
      monthCount: monthRows.length,
      monthFrom: month.from,
      payers: new Set(todayRows.map((c) => c.customerId).filter(Boolean)).size,
    };
  }, [all, entryClock]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (method && c.paymentMethod !== method) return false;
      if (!inWindow(c.entryDate, range)) return false;
      if (!q) return true;
      return [c.customerName, c.notes].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [all, method, range, search]);

  const summary = receivablesQ?.data;

  return (
    <div className="flex flex-col gap-4">
      <DataSection
        title="collection totals"
        query={[collectionsQ, ...(receivablesQ ? [receivablesQ] : [])]}
        shape="cards"
        placeholderHeight={90}
      >
        <KpiStrip columns="auto">
          <KpiTile
            label="Collected today"
            scope="today"
            value={formatMoney(kpis.today)}
            hint={entries(kpis.todayCount)}
          />
          <KpiTile
            label="Collected this month"
            scope={{ month: kpis.monthFrom }}
            value={formatMoney(kpis.month)}
            hint={entries(kpis.monthCount)}
          />
          <KpiTile label="Customers paid today" scope="today" value={String(kpis.payers)} />
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
            filters: (
              <div className="w-[140px]">
                <Select
                  inputSize="sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  aria-label="Filter by method"
                >
                  <option value="">All methods</option>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </Select>
              </div>
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
