import React, { useMemo, useState } from 'react';
import type { PayablesSummary } from '@pump/shared';
import {
  computeRange,
  DataSection,
  DateRangeMenu,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  TileSection,
  type DateRange,
} from '../../pump-ds/index.js';
import { useSupplierPayments } from '../../query/hooks.js';
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { formatMoney } from '../../utils/format.js';
import { countOf, type EntryClock } from '../../utils/ledgerWindow.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { PAYMENT_COLUMNS } from './columns.js';
import { paidToday, paymentFigures, suppliersCount, type QueryOf } from './supplierFigures.js';

export interface PaymentsTabProps {
  stationId: string | null;
  payablesQ: QueryOf<PayablesSummary>;
  entryClock: EntryClock;
  /** A row opens its supplier's statement. */
  onOpenSupplier: (supplierId: string) => void;
}

const payments = (n: number) => countOf(n, 'payment', 'payments');

const matches = (p: SupplierPaymentRow, q: string) =>
  [p.supplierName, p.notes, p.accountName].some((v) => v?.toLowerCase().includes(q));

/**
 * Suppliers → Payments: the Supplier Payments ledger (layout B, #567). Office
 * Records (ADR 0005): each carries its Entry Date and the Funding Account it
 * was paid from, never a shift. One Paid tile carries the month with its cash /
 * other split; the others add what the total does not say: today, how many
 * suppliers were paid, and what is still owed. The range, search and info tip
 * sit in the ledger's header; a row opens the supplier's statement.
 */
export const PaymentsTab: React.FC<PaymentsTabProps> = ({
  stationId,
  payablesQ,
  entryClock,
  onOpenSupplier,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  // The ledger reads its range from the server. Paid and Suppliers paid read
  // this month's payments, Paid today reads today's and Payable the payables
  // summary: three requests, so a failed month request never blanks Paid today
  // or Payable. A range equal to the month or today shares that cached request
  // with the ledger.
  const paymentsQ = useSupplierPayments({ stationId, ...range });
  const thisMonth = useMemo(() => computeRange('this-month', entryClock), [entryClock]);
  const today = useMemo(() => computeRange('today', entryClock), [entryClock]);
  const monthQ = useSupplierPayments({ stationId, ...thisMonth });
  const todayQ = useSupplierPayments({ stationId, ...today });
  const all = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const figures = useMemo(
    () => paymentFigures(monthQ.data ?? [], entryClock),
    [monthQ.data, entryClock],
  );
  const todayFigures = useMemo(
    () => paidToday(todayQ.data ?? [], entryClock),
    [todayQ.data, entryClock],
  );
  const month = { month: figures.monthFrom };
  const summary = payablesQ.data;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((p) => !q || matches(p, q))
      .sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''));
  }, [all, search]);

  return (
    <>
      <KpiStrip columns="auto">
        <TileSection title="paid this month" query={monthQ}>
          <KpiTile
            label="Paid"
            scope={month}
            value={formatMoney(figures.month)}
            hint={`${formatMoney(figures.cash)} cash · ${formatMoney(figures.other)} bank / owner`}
          />
        </TileSection>
        <TileSection title="paid today" query={todayQ}>
          <KpiTile
            label="Paid today"
            scope="today"
            value={formatMoney(todayFigures.amount)}
            hint={payments(todayFigures.count)}
          />
        </TileSection>
        <TileSection title="suppliers paid" query={monthQ}>
          <KpiTile
            label="Suppliers paid"
            scope={month}
            value={String(figures.suppliers)}
            hint={payments(figures.monthCount)}
          />
        </TileSection>
        <TileSection title="payable" query={payablesQ}>
          {summary && (
            <KpiTile
              label={MONEY_TERMS.payable}
              scope="now"
              value={formatMoney(summary.total)}
              hint={`still owed to ${suppliersCount(summary.supplierCount)}`}
            />
          )}
        </TileSection>
      </KpiStrip>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Supplier payments"
          subtitle={paymentsQ.data ? payments(rows.length) : undefined}
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
                Open a row for the supplier&rsquo;s statement.
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
                title={
                  search.trim() ? 'No matching payments' : 'No supplier payments in this range'
                }
                description={
                  search.trim()
                    ? 'Adjust the range or the search.'
                    : 'Record one with “Record supplier payment”, or pick another range.'
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
            onRowClick={(p) => onOpenSupplier(p.supplierId)}
          />
        </DataSection>
      </section>
    </>
  );
};
