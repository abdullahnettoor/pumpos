import React, { useMemo, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
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
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { formatMoney } from '../../utils/format.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildSupplierColumns, type PurchaseRow, type SupplierRow } from './columns.js';
import {
  SUPPLIER_FILTERS,
  balanceFigures,
  countOf,
  paymentFigures,
  purchaseFigures,
  type PurchaseClock,
  type SupplierFilter,
} from './supplierFigures.js';

export interface SuppliersTabProps {
  suppliersQ: UseQueryResult<SupplierRow[]>;
  purchasesQ: UseQueryResult<PurchaseRow[]>;
  paymentsQ: UseQueryResult<SupplierPaymentRow[]>;
  clock: PurchaseClock;
  onOpenStatement: (s: SupplierRow) => void;
  onEdit: (s: SupplierRow) => void;
}

const FILTER_LABEL: Record<SupplierFilter, string> = {
  all: 'All',
  payable: MONEY_TERMS.payable,
  advance: MONEY_TERMS.advance,
  inactive: 'Inactive',
};

const matches = (s: SupplierRow, q: string) =>
  [s.name, s.metadata?.tradeName, s.metadata?.gstin, s.phone].some((v) =>
    v?.toLowerCase().includes(q),
  );

/**
 * Suppliers → Suppliers: a balance list (layout B, #567). Four fixed tiles on
 * top: what you owe now, this month's purchases and payments, and advances
 * paid. The search and the row filters sit in the list's own header. The
 * balance column is net: an advance counts against what you owe.
 */
export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  suppliersQ,
  purchasesQ,
  paymentsQ,
  clock,
  onOpenStatement,
  onEdit,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SupplierFilter>('all');
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);

  const balances = useMemo(() => balanceFigures(suppliers), [suppliers]);
  const purchased = useMemo(
    () => purchaseFigures(purchasesQ.data ?? [], clock),
    [purchasesQ.data, clock],
  );
  const paid = useMemo(
    () => paymentFigures(paymentsQ.data ?? [], clock.entryToday),
    [paymentsQ.data, clock.entryToday],
  );
  const month = { month: clock.entryToday };

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? suppliers.filter((s) => matches(s, q)) : suppliers;
  }, [suppliers, search]);

  const options = useMemo<FilterChipOption<SupplierFilter>[]>(
    () =>
      (Object.keys(SUPPLIER_FILTERS) as SupplierFilter[]).map((value) => ({
        value,
        label: FILTER_LABEL[value],
        count: searched.filter(SUPPLIER_FILTERS[value]).length,
        ...(value === 'inactive' ? { status: 'inactive' as const } : {}),
      })),
    [searched],
  );

  const rows = useMemo(() => searched.filter(SUPPLIER_FILTERS[filter]), [searched, filter]);
  const columns = useMemo(
    () => buildSupplierColumns(onOpenStatement, onEdit),
    [onOpenStatement, onEdit],
  );
  // The balance column is net; say so when an advance is in the sum.
  const totalRow = useMemo<TotalRow>(
    () => ({
      label: rows.some((s) => Number(s.currentBalance || 0) < 0)
        ? 'Total, net of advances'
        : 'Total',
    }),
    [rows],
  );

  return (
    <>
      <DataSection
        title="supplier totals"
        query={[suppliersQ, purchasesQ, paymentsQ]}
        shape="cards"
        placeholderHeight={90}
      >
        <KpiStrip columns="auto">
          <KpiTile
            label={MONEY_TERMS.payable}
            scope="now"
            value={formatMoney(balances.payable)}
            hint={`to ${countOf(balances.payableCount, 'supplier')}`}
          />
          <KpiTile
            label="Purchased"
            scope={month}
            value={formatMoney(purchased.month)}
            hint={countOf(purchased.monthCount, 'invoice')}
          />
          <KpiTile
            label="Paid"
            scope={month}
            value={formatMoney(paid.month)}
            hint={countOf(paid.monthCount, 'payment')}
          />
          <KpiTile
            label="Advance paid"
            scope="now"
            value={formatMoney(balances.advance)}
            hint={
              balances.advanceCount
                ? `to ${countOf(balances.advanceCount, 'supplier')}`
                : 'no supplier paid ahead'
            }
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Suppliers"
          subtitle={suppliersQ.data ? countOf(rows.length, 'supplier') : undefined}
          controls={{
            search: (
              <div className="w-[220px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name / GSTIN / phone…"
                />
              </div>
            ),
            filters: (
              <FilterChips
                aria-label="Supplier balance"
                options={options}
                value={filter}
                onChange={setFilter}
              />
            ),
            info: (
              <InfoTip label="About supplier balances" placement="bottom">
                A supplier&rsquo;s balance is every purchase less every payment. Payable is what you
                owe; Advance is money paid ahead of purchases. Open a supplier for the full
                statement.
              </InfoTip>
            ),
          }}
        />
        <DataSection
          title="suppliers"
          query={suppliersQ}
          placeholderHeight={240}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="truck" size="md" />}
                title={suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers'}
                description={
                  suppliers.length === 0
                    ? 'Add a supplier with “Add supplier”.'
                    : 'Try a different search or filter.'
                }
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            totalRow={totalRow}
            title="suppliers"
          />
        </DataSection>
      </section>
    </>
  );
};
