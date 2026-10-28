import React, { useMemo, useState } from 'react';
import type { VarianceStatusState } from '@pump/shared';
import {
  DataSection,
  DateRangeMenu,
  EmptyState,
  FilterChips,
  Icon,
  InteractiveTable,
  SectionHeader,
  computeRange,
  type DateRange,
  type FilterChipOption,
  type RangeClock,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatStockVariance } from '../../utils/variance.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  oneProduct,
  reconciliationCounts,
  reconciliationsIn,
  varianceState,
  type VarianceRow,
} from './inventoryFigures.js';
import type { QueryOf } from '../purchases/supplierFigures.js';

export interface ReconciliationsViewProps {
  variancesQ: QueryOf<VarianceRow[]>;
  clock: RangeClock;
}

type Filter = 'all' | VarianceStatusState;

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  short: 'Short',
  surplus: 'Surplus',
  balanced: 'Balanced',
};

const stateOf = varianceState;

/** A variance's figure in its tone: red short, amber surplus (#518), plain when balanced. */
const VARIANCE_TEXT: Record<VarianceStatusState, string> = {
  short: 'text-danger-fg',
  surplus: 'text-warning-fg',
  balanced: '',
};

const reconciliations = (n: number) => countOf(n, 'reconciliation', 'reconciliations');

const COLUMNS: TableColumn<VarianceRow>[] = [
  {
    id: 'date',
    header: 'Business day',
    kind: 'date',
    value: (r) => r.businessDate,
    width: '13%',
  },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.productName, emphasis: true },
  { id: 'tank', header: 'Tank', kind: 'text', value: (r) => r.tankName, width: '11%' },
  {
    id: 'expected',
    header: 'Expected',
    kind: 'qty',
    value: (r) => r.expectedQuantity,
    unit: (r) => r.productUnit,
    total: false,
    width: '13%',
  },
  {
    id: 'actual',
    header: 'Counted',
    kind: 'qty',
    value: (r) => r.actualQuantity,
    unit: (r) => r.productUnit,
    total: false,
    width: '13%',
  },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'qty',
    value: (r) => r.varianceQuantity,
    unit: (r) => r.productUnit,
    cell: (r) => (
      <span className={VARIANCE_TEXT[stateOf(r)]}>
        {formatStockVariance(r.varianceQuantity, r.productUnit)}
      </span>
    ),
    width: '13%',
  },
  { id: 'status', header: 'Status', kind: 'status', value: stateOf, width: '11%' },
  { id: 'reason', header: 'Reason', kind: 'text', value: (r) => r.reason || 'Stock count' },
];

/**
 * Inventory → Reconciliations: every stock count and its variance, a ledger
 * (layout B, #567). The count of reconciliations moved here from the page's
 * tiles (owner decision, #536). The one balanced rule (#518) colours a
 * variance; the net variance shows when the rows are one product.
 */
export const ReconciliationsView: React.FC<ReconciliationsViewProps> = ({ variancesQ, clock }) => {
  // Counts are occasional: the year, not the month, by default.
  const [range, setRange] = useState<DateRange>(() => computeRange('this-year', clock));
  const [filter, setFilter] = useState<Filter>('all');
  const all = useMemo(() => variancesQ.data ?? [], [variancesQ.data]);
  const inRange = useMemo(() => reconciliationsIn(all, range), [all, range]);
  const options = useMemo<FilterChipOption<Filter>[]>(() => {
    const counts = reconciliationCounts(inRange);
    return (Object.keys(FILTER_LABEL) as Filter[]).map((value) => ({
      value,
      label: FILTER_LABEL[value],
      count: counts[value],
      ...(value === 'short' || value === 'surplus' ? { status: value } : {}),
    }));
  }, [inRange]);
  const rows = useMemo(
    () => (filter === 'all' ? inRange : inRange.filter((r) => stateOf(r) === filter)),
    [inRange, filter],
  );
  const totalRow = useMemo<TotalRow | undefined>(
    () =>
      oneProduct(rows) ? { label: `Net variance, ${rows[0].productName ?? 'product'}` } : undefined,
    [rows],
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Reconciliations"
        subtitle={variancesQ.data ? reconciliations(rows.length) : undefined}
        controls={{
          range: (
            <DateRangeMenu
              value={range}
              onChange={setRange}
              clock={clock}
              align="end"
              aria-label="Reconciliations period"
            />
          ),
          filters: variancesQ.data && (
            <FilterChips
              aria-label="Variance"
              options={options}
              value={filter}
              onChange={setFilter}
            />
          ),
          info: (
            <InfoTip label="About reconciliations" placement="bottom">
              Each stock count (&ldquo;Reconcile stock&rdquo;) logs the book stock it expected, what
              was counted, and the difference. Short is less than the books, surplus more; a count
              that matches is balanced. Book stock moves to the count, except for a tank dip taken
              while a shift is open.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="reconciliations"
        query={variancesQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="scale" size="md" />}
              title={all.length === 0 ? 'No reconciliations yet' : 'No matching reconciliations'}
              description={
                all.length === 0
                  ? 'Record a physical count with “Reconcile stock”.'
                  : 'Adjust the range or the filter.'
              }
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          totalRow={totalRow}
          title="reconciliations"
        />
      </DataSection>
    </section>
  );
};
