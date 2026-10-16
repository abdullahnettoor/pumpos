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
import { formatMoney } from '../../utils/format.js';
import { countOf, type EntryClock } from '../../utils/ledgerWindow.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  buildPurchaseColumns,
  isAwaitingDecantation,
  purchaseDate,
  type PurchaseLinkRow,
  type PurchaseRow,
} from './columns.js';
import {
  purchasedToday,
  purchasesIn,
  suppliersCount,
  type PurchaseClock,
  type QueryOf,
} from './supplierFigures.js';

export interface PurchasesTabProps {
  purchasesQ: QueryOf<PurchaseRow[]>;
  payablesQ: QueryOf<PayablesSummary>;
  clock: PurchaseClock;
  /** The station calendar clock the range menu resolves with. */
  entryClock: EntryClock;
  onOpen: (purchase: PurchaseRow) => void;
  onLinkToDecantation: (purchase: PurchaseLinkRow) => void;
  /** `purchases.viewCosts`: hides the amounts (the figures are also withheld by the server). */
  canViewCosts?: boolean;
}

const invoices = (n: number) => countOf(n, 'invoice', 'invoices');

const matches = (p: PurchaseRow, q: string) =>
  [p.supplierName, p.invoiceNumber, p.documentNumber, p.notes, p.itemsSummary].some((v) =>
    v?.toLowerCase().includes(q),
  );

/**
 * Suppliers → Purchases: a ledger (layout B, #567). Fixed tiles on top, each
 * in its own Data Section and none repeating the ledger's total: today's
 * purchases, what you owe now, and the fuel purchases still to link. The range,
 * search and info tip sit in the ledger's header. Newest first; a row opens the
 * invoice.
 */
export const PurchasesTab: React.FC<PurchasesTabProps> = ({
  purchasesQ,
  payablesQ,
  clock,
  entryClock,
  onOpen,
  onLinkToDecantation,
  canViewCosts = true,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);
  const summary = payablesQ.data;

  const today = useMemo(() => purchasedToday(purchases, clock), [purchases, clock]);
  const awaiting = useMemo(() => purchases.filter(isAwaitingDecantation).length, [purchases]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchasesIn(purchases, range)
      .filter((p) => !q || matches(p, q))
      .sort((a, b) => (purchaseDate(b) ?? '').localeCompare(purchaseDate(a) ?? ''));
  }, [purchases, search, range]);

  const columns = useMemo(
    () => buildPurchaseColumns(onLinkToDecantation, canViewCosts),
    [onLinkToDecantation, canViewCosts],
  );

  return (
    <>
      <KpiStrip columns="auto">
        {canViewCosts && (
          <TileSection title="purchased today" query={purchasesQ}>
            <KpiTile
              label="Purchased today"
              scope="today"
              value={formatMoney(today.total)}
              hint={invoices(today.count)}
            />
          </TileSection>
        )}
        <TileSection title="payable" query={payablesQ}>
          {summary && (
            <KpiTile
              label={MONEY_TERMS.payable}
              scope="now"
              value={formatMoney(summary.total)}
              hint={`to ${suppliersCount(summary.supplierCount)}`}
            />
          )}
        </TileSection>
        <TileSection title="awaiting decantation" query={purchasesQ}>
          <KpiTile
            label="Awaiting decantation"
            scope="now"
            value={String(awaiting)}
            hint={awaiting > 0 ? 'fuel purchases to link' : 'every fuel purchase linked'}
          />
        </TileSection>
      </KpiStrip>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Purchases"
          subtitle={purchasesQ.data ? invoices(rows.length) : undefined}
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
