import React, { useMemo, useState } from 'react';
import {
  Button,
  FilterChips,
  GroupedTable,
  SectionHeader,
  StatusChip,
  VarianceChip,
  type FilterChipOption,
  type TableColumn,
  type TableGroup,
  type TotalRow,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { formatClockInZone, formatMoney } from '../../utils/format.js';
import {
  filterNozzleGroups,
  nozzleTotal,
  nozzleProducts,
  type NozzleGroup,
  type NozzleRow,
  type StaffAssignmentInput,
} from './liveShiftModel.js';

export interface NozzleReadingsTableProps {
  groups: NozzleGroup[];
  timeZone?: string;
  /** Record or view a Drawer's Handover (the Handover drawer). */
  onOpenHandover: (assignment: StaffAssignmentInput) => void;
}

const READING = { kind: 'qty', unit: 'L', decimals: 3, total: false } as const;

const COLUMNS: TableColumn<NozzleRow>[] = [
  {
    id: 'nozzle',
    header: 'Nozzle',
    kind: 'text',
    value: (r) => r.nozzle,
    emphasis: true,
    width: '9%',
  },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product, width: '15%' },
  // Meter readings: litres to the meter's 3 decimals, never totalled.
  { id: 'opening', header: 'Opening', value: (r) => r.opening, ...READING },
  { id: 'closing', header: 'Closing', value: (r) => r.closing, ...READING },
  { id: 'litres', header: 'Litres', kind: 'qty', value: (r) => r.litres, unit: (r) => r.unit },
  { id: 'rate', header: 'Rate', kind: 'money', value: (r) => r.rate, total: false, width: '11%' },
  {
    id: 'value',
    header: 'Value',
    kind: 'money',
    value: (r) => r.value,
    // Blank like the litres it multiplies, not an empty cell.
    cell: (r) => (r.value == null ? '—' : formatMoney(r.value)),
  },
];

/**
 * Live shift → Nozzle readings (#533, layout B): every nozzle under its Drawer
 * (DU · attendant), with the Drawer's handover status, its variance once handed
 * over, and the button that records or opens its Handover. Closing readings
 * are taken in the Handover, so a Drawer still out reads blank. The product
 * filter applies at once; the total row says what it leaves out.
 */
export const NozzleReadingsTable: React.FC<NozzleReadingsTableProps> = ({
  groups,
  timeZone,
  onOpenHandover,
}) => {
  const [product, setProduct] = useState('all');
  const products = useMemo(() => nozzleProducts(groups), [groups]);
  const nozzleCount = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0), [groups]);
  const options = useMemo<FilterChipOption<string>[]>(
    () => [
      { value: 'all', label: 'All', count: nozzleCount },
      ...products.map((p) => ({ value: p.key, label: p.label, count: p.count })),
    ],
    [products, nozzleCount],
  );
  const shown = useMemo(() => filterNozzleGroups(groups, product), [groups, product]);

  // The total sums handed-over Drawers only and says which it leaves out.
  const totalRow = useMemo<TotalRow>(() => {
    const t = nozzleTotal(shown, product !== 'all');
    return { label: t.label, values: { litres: t.litres, value: t.value } };
  }, [shown, product]);

  const tableGroups = useMemo<TableGroup<NozzleRow>[]>(
    () =>
      shown.map((g) => ({
        key: g.key,
        muted: !!g.assignment && !g.handover,
        rows: g.rows,
        header: (
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-strong">{g.label}</span>
            {g.status && (
              <StatusChip
                status={g.status}
                size="md"
                label={
                  g.status === 'handover-recorded' && g.handover?.createdAt
                    ? `Recorded ${formatClockInZone(g.handover.createdAt, timeZone)}`
                    : undefined
                }
              />
            )}
            {g.handover && <VarianceChip amount={g.handover.varianceAmount} size="md" />}
            {g.assignment && (
              <Button
                className="ml-auto"
                variant={g.handover ? 'ghost' : 'secondary'}
                size="xs"
                onClick={() => onOpenHandover(g.assignment!)}
              >
                {g.handover ? 'View handover' : 'Record handover'}
              </Button>
            )}
          </div>
        ),
      })),
    [shown, timeZone, onOpenHandover],
  );

  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Nozzle readings">
      <SectionHeader
        title="Nozzle readings"
        subtitle="Closing readings come with each handover"
        controls={{
          filters:
            products.length > 1 ? (
              <FilterChips
                aria-label="Nozzle product"
                options={options}
                value={product}
                onChange={setProduct}
              />
            ) : undefined,
          info: (
            <InfoTip label="About nozzle readings" placement="bottom">
              Opening readings carry over from the last closing. Litres = closing − opening; value =
              litres × the rate. A Drawer that has not handed over reads blank until its closing
              readings are taken.
            </InfoTip>
          ),
        }}
      />
      <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
        <GroupedTable
          label="Nozzle readings"
          columns={COLUMNS}
          groups={tableGroups}
          rowKey={(r) => r.nozzleId}
          totalRow={totalRow}
        />
      </div>
    </section>
  );
};
