import React, { useMemo, useState } from 'react';
import type { PayablesSummary } from '@pump/shared';
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
  TileSection,
  type FilterChipOption,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { buildSupplierColumns, type SupplierRow } from './columns.js';
import {
  SUPPLIER_FILTERS,
  advanceFigures,
  suppliersCount,
  type QueryOf,
  type SupplierFilter,
} from './supplierFigures.js';

export interface SuppliersTabProps {
  suppliersQ: QueryOf<SupplierRow[]>;
  payablesQ: QueryOf<PayablesSummary>;
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
 * Suppliers → Suppliers: a balance list (layout B, #567). Tiles on top, each
 * in its own Data Section: Payable, this month's Purchased and Paid from the
 * server's payables summary, and advances paid from the list. The search and
 * the row filters sit in the list's own header. Unfiltered, the Payable tile
 * carries the total, so the list has no total row; a filtered list totals the
 * rows shown.
 */
export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  suppliersQ,
  payablesQ,
  onOpenStatement,
  onEdit,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SupplierFilter>('all');
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const summary = payablesQ.data;
  const advance = useMemo(() => advanceFigures(suppliers), [suppliers]);

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
  const filtered = filter !== 'all' || !!search.trim();
  const columns = useMemo(
    () => buildSupplierColumns(onOpenStatement, onEdit),
    [onOpenStatement, onEdit],
  );
  // The balance column is net: say so when an advance is in the sum.
  const totalRow = useMemo<TotalRow | undefined>(() => {
    if (!filtered) return undefined;
    const advances = rows.some((s) => Number(s.currentBalance || 0) < 0);
    return { label: `Total of ${rows.length} shown${advances ? ', net of advances' : ''}` };
  }, [filtered, rows]);

  return (
    <>
      <KpiStrip columns="auto">
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
        <TileSection title="purchased this month" query={payablesQ}>
          {summary && (
            <KpiTile
              label="Purchased"
              scope={{ month: summary.month.purchasedMonth }}
              value={formatMoney(summary.month.purchased)}
            />
          )}
        </TileSection>
        <TileSection title="paid this month" query={payablesQ}>
          {summary && (
            <KpiTile
              label="Paid"
              scope={{ month: summary.month.paidMonth }}
              value={formatMoney(summary.month.paid)}
            />
          )}
        </TileSection>
        <TileSection title="advances" query={suppliersQ}>
          <KpiTile
            label="Advance paid"
            scope="now"
            value={formatMoney(advance.total)}
            hint={advance.count ? `to ${suppliersCount(advance.count)}` : 'no supplier paid ahead'}
          />
        </TileSection>
      </KpiStrip>

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Suppliers"
          subtitle={
            suppliersQ.data
              ? filtered
                ? `${rows.length} of ${suppliers.length}`
                : suppliersCount(suppliers.length)
              : undefined
          }
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
            filters: suppliersQ.data && (
              <FilterChips
                aria-label="Supplier balance"
                options={options}
                value={filter}
                onChange={setFilter}
              />
            ),
            info: (
              <InfoTip label="About supplier balances" placement="bottom">
                Each station keeps its own account with a supplier: balances here are this
                station&rsquo;s purchases less its payments. Payable is what this station owes
                active suppliers now; Advance is money paid ahead of purchases. A payment covering
                two stations is recorded as one payment at each. Open a supplier for the full
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
