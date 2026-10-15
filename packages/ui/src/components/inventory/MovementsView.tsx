import React, { useMemo, useState } from 'react';
import {
  DataSection,
  DateRangeMenu,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SearchInput,
  SectionHeader,
  Select,
  computeRange,
  type DateRange,
  type FilterChipOption,
  type RangeClock,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatQuantity } from '../../utils/format.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  movementTypeLabel,
  movementsIn,
  oneProduct,
  productCounts,
  productsOf,
  referenceLabel,
  type MovementRow,
} from './inventoryFigures.js';
import type { QueryOf } from '../purchases/supplierFigures.js';

export interface MovementsViewProps {
  movementsQ: QueryOf<MovementRow[]>;
  /** The station clock: a movement sits on a Business Day. */
  clock: RangeClock;
}

const MOVEMENT_TYPES = [
  'Sale',
  'Purchase',
  'Decantation',
  'Adjustment',
  'Variance',
  'OpeningBalance',
] as const;

/** Fewer products than this read as counted chips; more, as a dropdown (control vocabulary). */
const PRODUCT_CHIPS_BELOW = 5;

const movements = (n: number) => countOf(n, 'movement', 'movements');

const COLUMNS: TableColumn<MovementRow>[] = [
  {
    id: 'date',
    header: 'Business day',
    kind: 'date',
    value: (m) => m.businessDate,
    width: '14%',
  },
  { id: 'product', header: 'Product', kind: 'text', value: (m) => m.productName, emphasis: true },
  {
    id: 'type',
    header: 'Type',
    kind: 'text',
    value: (m) => movementTypeLabel(m.movementType),
    width: '14%',
  },
  { id: 'tank', header: 'Tank', kind: 'text', value: (m) => m.tankName, width: '14%' },
  {
    id: 'reference',
    header: 'Reference',
    kind: 'text',
    // A reference that only repeats the type ("Decantation") reads "—".
    value: (m) => {
      const ref = referenceLabel(m.referenceType);
      return ref === movementTypeLabel(m.movementType) ? null : ref;
    },
    width: '16%',
  },
  {
    id: 'quantity',
    header: 'Quantity',
    kind: 'qty',
    value: (m) => m.quantity,
    unit: (m) => m.productUnit,
    // In is +, out is −: the sign is the direction, not a colour.
    cell: (m) => formatQuantity(m.quantity, m.productUnit, { plus: true }),
    width: '16%',
  },
];

/**
 * Inventory → Movements: the stock ledger (layout B, #567), straight from
 * `stock_movements`. Range, search, type and product sit in the ledger's
 * header and apply at once. Quantities add up only for one product, so the
 * net row shows when the rows are one product.
 */
export const MovementsView: React.FC<MovementsViewProps> = ({ movementsQ, clock }) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [productId, setProductId] = useState('');
  const all = useMemo(() => movementsQ.data ?? [], [movementsQ.data]);
  const products = useMemo(() => productsOf(all), [all]);
  const rows = useMemo(
    () =>
      movementsIn(all, { range, type, productId, search }).sort((a, b) =>
        (b.businessDate ?? '').localeCompare(a.businessDate ?? ''),
      ),
    [all, range, type, productId, search],
  );
  const productOptions = useMemo<FilterChipOption<string>[]>(() => {
    const counts = productCounts(all, { range, type, search });
    return [
      { value: '', label: 'All', count: counts[''] },
      ...products.map((p) => ({ value: p.id, label: p.name, count: counts[p.id] ?? 0 })),
    ];
  }, [all, products, range, type, search]);
  const totalRow = useMemo<TotalRow | undefined>(
    () =>
      oneProduct(rows)
        ? { label: `Net of ${movements(rows.length)}, ${rows[0].productName ?? 'product'}` }
        : undefined,
    [rows],
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Stock movements"
        subtitle={movementsQ.data ? movements(rows.length) : undefined}
        controls={{
          range: (
            <DateRangeMenu
              value={range}
              onChange={setRange}
              clock={clock}
              align="end"
              aria-label="Movements period"
            />
          ),
          search: (
            <div className="w-[200px]">
              <SearchInput
                inputSize="sm"
                value={search}
                onChange={setSearch}
                placeholder="Search product / tank…"
              />
            </div>
          ),
          filters: (
            <>
              <Select
                inputSize="sm"
                aria-label="Movement type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">All types</option>
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {movementTypeLabel(t)}
                  </option>
                ))}
              </Select>
              {products.length < PRODUCT_CHIPS_BELOW ? (
                <FilterChips
                  aria-label="Product"
                  options={productOptions}
                  value={productId}
                  onChange={setProductId}
                />
              ) : (
                <Select
                  inputSize="sm"
                  aria-label="Product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">All products</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </>
          ),
          info: (
            <InfoTip label="About stock movements" placement="bottom">
              Every change to book stock, dated by its Business Day: fuel sales from nozzle
              readings, decantations, product purchases and sales, and the adjustments a stock count
              posts. Stock in reads +, stock out −. A net row shows when the rows are one product.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="stock movements"
        query={movementsQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="arrow-left-right" size="md" />}
              title={all.length === 0 ? 'No movements yet' : 'No matching movements'}
              description={
                all.length === 0
                  ? 'Sales, decantations and stock counts post here.'
                  : 'Adjust the range, the search or the filters.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={COLUMNS}
          rows={rows}
          rowKey={(m) => m.id}
          totalRow={totalRow}
          title="stock movements"
        />
      </DataSection>
    </section>
  );
};
