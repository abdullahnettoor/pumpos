import React, { useMemo, useState } from 'react';
import {
  DataSection,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  StatusChip,
  type FilterChipOption,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  ITEM_FILTERS,
  itemState,
  matchesItem,
  type ItemFilter,
  type ItemRow,
} from './inventoryFigures.js';
import type { QueryOf } from '../purchases/supplierFigures.js';

export interface ProductStockViewProps {
  itemsQ: QueryOf<ItemRow[]>;
  /** Deep link from a stock alert: the product row to highlight. */
  highlightId: string | null;
}

const sentenceCase = (code: string) =>
  code
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

const productsCount = (n: number) => countOf(n, 'product', 'products');

const FILTER: Record<ItemFilter, { label: string; status?: 'out-of-stock' | 'oversold' }> = {
  all: { label: 'All' },
  'out-of-stock': { label: 'Out of stock', status: 'out-of-stock' },
  oversold: { label: 'Oversold', status: 'oversold' },
};

const COLUMNS: TableColumn<ItemRow>[] = [
  { id: 'name', header: 'Product', kind: 'text', value: (i) => i.name, emphasis: true },
  { id: 'code', header: 'Code', kind: 'text', value: (i) => i.code, width: '14%' },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    // The API sends a code ("LUBRICANT"): read it in sentence case.
    value: (i) => (i.productType ? sentenceCase(i.productType) : null),
    width: '14%',
  },
  {
    id: 'onHand',
    header: 'On hand',
    kind: 'qty',
    value: (i) => i.quantity,
    unit: (i) => i.unit,
    width: '16%',
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'text',
    value: (i) => itemState(i) ?? '',
    cell: (i) => {
      const state = itemState(i);
      return state ? <StatusChip status={state} size="md" /> : null;
    },
    width: '16%',
  },
];

/**
 * Inventory → Product stock: merchandise on hand, a balance list (layout B,
 * #567). Search and the status filter sit in the list's header and apply at
 * once. Unfiltered there is no total (the tiles carry the counts); a filtered
 * list totals what it shows.
 */
export const ProductStockView: React.FC<ProductStockViewProps> = ({ itemsQ, highlightId }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ItemFilter>('all');
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => matchesItem(i, q)) : items;
  }, [items, search]);
  const options = useMemo<FilterChipOption<ItemFilter>[]>(
    () =>
      (Object.keys(ITEM_FILTERS) as ItemFilter[]).map((value) => ({
        value,
        label: FILTER[value].label,
        count: searched.filter(ITEM_FILTERS[value]).length,
        ...(FILTER[value].status ? { status: FILTER[value].status } : {}),
      })),
    [searched],
  );
  const rows = useMemo(
    () =>
      searched
        .filter((i) => ITEM_FILTERS[filter](i) || i.productId === highlightId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searched, filter, highlightId],
  );
  const filtered = filter !== 'all' || !!search.trim();
  const totalRow = useMemo<TotalRow | undefined>(
    () => (filtered ? { label: `Total of ${rows.length} shown` } : undefined),
    [filtered, rows.length],
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Product stock"
        subtitle={
          itemsQ.data
            ? filtered
              ? `${rows.length} of ${items.length}`
              : productsCount(items.length)
            : undefined
        }
        controls={{
          search: (
            <div className="w-[220px]">
              <SearchInput
                inputSize="sm"
                value={search}
                onChange={setSearch}
                placeholder="Search product / code…"
              />
            </div>
          ),
          filters: itemsQ.data && (
            <FilterChips
              aria-label="Product stock status"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          ),
          info: (
            <InfoTip label="About product stock" placement="bottom">
              On hand is every purchase and stock count less every product sale. Oversold means more
              was sold than the books hold: count the shelf and reconcile it with &ldquo;Reconcile
              stock&rdquo;. A total in mixed units reads &ldquo;—&rdquo;.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="product stock"
        query={itemsQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="package" size="md" />}
              title={items.length === 0 ? 'No products' : 'No matching products'}
              description={
                items.length === 0
                  ? 'Add non-fuel products in Station → Products.'
                  : 'Try a different search or filter.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={COLUMNS}
          rows={rows}
          rowKey={(i) => i.productId}
          totalRow={totalRow}
          highlightRowId={highlightId}
          title="product stock"
        />
      </DataSection>
    </section>
  );
};
