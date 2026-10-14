import React, { useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
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
} from '../../pump-ds/index.js';
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { formatMoney } from '../../utils/format.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { PAYMENT_COLUMNS } from './columns.js';
import { countOf, paymentFigures } from './supplierFigures.js';

export interface PaymentsTabProps {
  paymentsQ: UseQueryResult<SupplierPaymentRow[]>;
  /** The station calendar date: Supplier Payments are dated by Entry Date. */
  entryToday: string;
  entryClock: RangeClock;
}

const matches = (p: SupplierPaymentRow, q: string) =>
  [p.supplierName, p.notes, p.accountName].some((v) => v?.toLowerCase().includes(q));

/**
 * Suppliers → Payments: the Supplier Payments ledger (layout B, #567). Office
 * Records (ADR 0005): each carries its Entry Date and the Funding Account it
 * was paid from, never a shift. Fixed tiles on top, the range, search and info
 * tip in the ledger's header.
 */
export const PaymentsTab: React.FC<PaymentsTabProps> = ({ paymentsQ, entryToday, entryClock }) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const figures = useMemo(() => paymentFigures(payments, entryToday), [payments, entryToday]);
  const month = { month: entryToday };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments
      .filter((p) => {
        if (q && !matches(p, q)) return false;
        return !(p.entryDate && (p.entryDate < range.from || p.entryDate > range.to));
      })
      .sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''));
  }, [payments, search, range.from, range.to]);

  return (
    <>
      <DataSection title="payment totals" query={paymentsQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Paid today"
            scope="today"
            value={formatMoney(figures.today)}
            hint="by entry date"
          />
          <KpiTile
            label="Paid this month"
            scope={month}
            value={formatMoney(figures.month)}
            hint={countOf(figures.monthCount, 'payment')}
          />
          <KpiTile
            label="From cash in hand / petty"
            scope={month}
            value={formatMoney(figures.cashMonth)}
          />
          <KpiTile
            label="From bank / owner"
            scope={month}
            value={formatMoney(figures.otherMonth)}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Supplier payments"
          subtitle={paymentsQ.data ? countOf(rows.length, 'payment') : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={entryClock}
                align="end"
                aria-label="Supplier payments period"
              />
            ),
            search: (
              <div className="w-[220px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search supplier / notes…"
                />
              </div>
            ),
            info: (
              <InfoTip label="About supplier payments" placement="bottom">
                Supplier payments are office records: dated by entry date and paid from the chosen
                account. They never touch a shift drawer. Each lowers what you owe that supplier.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="supplier payments"
          query={paymentsQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="wallet" size="md" />}
                title={payments.length === 0 ? 'No supplier payments yet' : 'No matching payments'}
                description={
                  payments.length === 0
                    ? 'Record one with “Record supplier payment”.'
                    : 'Adjust the range or the search.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={PAYMENT_COLUMNS}
            rows={rows}
            rowKey={(p) => p.id}
            totalRow
            title="supplier payments"
          />
        </DataSection>
      </section>
    </>
  );
};
