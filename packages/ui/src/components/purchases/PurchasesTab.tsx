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
import { formatMoney } from '../../utils/format.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  buildPurchaseColumns,
  isAwaitingDecantation,
  purchaseDate,
  type PurchaseLinkRow,
  type PurchaseRow,
  type SupplierRow,
} from './columns.js';
import { balanceFigures, countOf, purchaseFigures, type PurchaseClock } from './supplierFigures.js';

export interface PurchasesTabProps {
  purchasesQ: UseQueryResult<PurchaseRow[]>;
  suppliersQ: UseQueryResult<SupplierRow[]>;
  clock: PurchaseClock;
  /** The station calendar clock the range menu resolves with. */
  entryClock: RangeClock;
  onOpen: (purchase: PurchaseRow) => void;
  onLinkToDecantation: (purchase: PurchaseLinkRow) => void;
}

const matches = (p: PurchaseRow, q: string) =>
  [p.supplierName, p.invoiceNumber, p.documentNumber, p.notes, p.itemsSummary].some((v) =>
    v?.toLowerCase().includes(q),
  );

/**
 * Suppliers → Purchases: a ledger (layout B, #567). The fixed tiles name their
 * period; the range, search and info tip sit in the ledger's header, directly
 * above the table they filter. Newest first; a row opens the invoice.
 */
export const PurchasesTab: React.FC<PurchasesTabProps> = ({
  purchasesQ,
  suppliersQ,
  clock,
  entryClock,
  onOpen,
  onLinkToDecantation,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);

  const figures = useMemo(() => purchaseFigures(purchases, clock), [purchases, clock]);
  const payable = useMemo(() => balanceFigures(suppliersQ.data ?? []), [suppliersQ.data]);
  const awaiting = useMemo(() => purchases.filter(isAwaitingDecantation).length, [purchases]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases
      .filter((p) => {
        if (q && !matches(p, q)) return false;
        const d = purchaseDate(p);
        return !(d && (d < range.from || d > range.to));
      })
      .sort((a, b) => (purchaseDate(b) ?? '').localeCompare(purchaseDate(a) ?? ''));
  }, [purchases, search, range.from, range.to]);

  const columns = useMemo(() => buildPurchaseColumns(onLinkToDecantation), [onLinkToDecantation]);

  return (
    <>
      <DataSection
        title="purchase totals"
        query={[purchasesQ, suppliersQ]}
        shape="cards"
        placeholderHeight={90}
      >
        <KpiStrip columns="auto">
          <KpiTile
            label="Purchased today"
            scope="today"
            value={formatMoney(figures.today)}
            hint={countOf(figures.todayCount, 'invoice')}
          />
          <KpiTile
            label="Purchased this month"
            scope={{ month: clock.entryToday }}
            value={formatMoney(figures.month)}
            hint={countOf(figures.monthCount, 'invoice')}
          />
          <KpiTile
            label={MONEY_TERMS.payable}
            scope="now"
            value={formatMoney(payable.payable)}
            hint={`to ${countOf(payable.payableCount, 'supplier')}`}
          />
          <KpiTile
            label="Awaiting decantation"
            scope="now"
            value={String(awaiting)}
            alert={awaiting > 0 ? 'warning' : undefined}
            hint={awaiting > 0 ? 'fuel purchases to link' : 'every fuel purchase linked'}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Purchases"
          subtitle={purchasesQ.data ? countOf(rows.length, 'invoice') : undefined}
          controls={{
            range: (
              <DateRangeMenu
                value={range}
                onChange={setRange}
                clock={entryClock}
                align="end"
                aria-label="Purchases period"
              />
            ),
            search: (
              <div className="w-[220px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search supplier / invoice…"
                />
              </div>
            ),
            info: (
              <InfoTip label="About purchases" placement="bottom">
                Purchases post to the selected date; no open shift is needed. Each raises a supplier
                payable: pay it at once with &ldquo;Record payment now&rdquo; in the purchase form,
                or later from the supplier statement.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="purchases"
          query={purchasesQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="cart" size="md" />}
                title={purchases.length === 0 ? 'No purchases yet' : 'No matching purchases'}
                description={
                  purchases.length === 0
                    ? 'Record a purchase to see it here.'
                    : 'Adjust the range or the search.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            totalRow
            title="purchases"
            onRowClick={onOpen}
          />
        </DataSection>
      </section>
    </>
  );
};
