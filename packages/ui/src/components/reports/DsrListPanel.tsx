import React, { useMemo, useState } from 'react';
import {
  deriveDssrRangeKpis,
  readDssrCashSales,
  readDssrNetVolume,
  readSnapshot,
} from '@pump/shared';
import { Play } from 'lucide-react';
import { useDailyDssrRange } from '../../query/hooks.js';
import { formatDate, formatMoney, formatQty } from '../../utils/format.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { InfoTip } from '../primitives/InfoTip.js';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  Input,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
  type TableColumn,
} from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';

type DsrRow = any;

const netVolumeLabel = (row: DsrRow) => {
  const perUnit = Object.entries(readDssrNetVolume(readSnapshot(row)));
  return perUnit.map(([unit, qty]) => formatQty(qty, 2, unit)).join(' · ') || formatQty(0, 2, 'L');
};

const COLUMNS: TableColumn<DsrRow>[] = [
  { id: 'businessDate', header: 'Business date', kind: 'date', value: (r) => r.businessDate },
  {
    id: 'shifts',
    header: 'Shifts',
    kind: 'text',
    value: (r) => Number(r.snapshotData?.shiftsIncluded || 0),
  },
  {
    id: 'volume',
    header: 'Net volume sold',
    kind: 'text',
    value: netVolumeLabel,
    cell: (r) => <span className="font-mono tabular-nums">{netVolumeLabel(r)}</span>,
  },
  {
    // Per-day source of the "Cash sales" tile, so it is not totalled again
    // here. Days frozen before #516 carry no figure and read "—", never ₹0.
    id: 'cashSales',
    header: 'Cash sales',
    kind: 'money',
    total: false,
    value: (r) => readDssrCashSales(readSnapshot(r)),
    cell: (r) => {
      const cash = readDssrCashSales(readSnapshot(r));
      return cash == null ? '—' : formatMoney(cash);
    },
  },
  {
    id: 'grossMargin',
    header: 'Gross margin',
    kind: 'money',
    value: (r) => Number(r.snapshotData?.pnl?.grossMargin || 0),
  },
];

export interface DsrListPanelProps {
  stationId: string | null;
  clock: { timeZone?: string; dayStartsAt?: string };
  /** The business date the Generate button freezes (a deep link may preset it). */
  generateDate: string;
  onGenerateDateChange: (date: string) => void;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  onOpen: (dsr: DsrRow) => void;
  /** Only while the DSR tab shows, so the range query runs only then. */
  enabled: boolean;
}

/**
 * Reports › DSR (#531): the generated daily snapshots in a range, layout A.
 * One control bar (range · Generate) drives the tiles and the list; a row
 * opens that day's DSR.
 */
export const DsrListPanel: React.FC<DsrListPanelProps> = ({
  stationId,
  clock,
  generateDate,
  onGenerateDateChange,
  generating,
  generateError,
  onGenerate,
  onOpen,
  enabled,
}) => {
  const [range, setRange] = useState<DateRange>(() => computeRange('last-30', clock));
  const dssrQ = useDailyDssrRange(stationId, range.from, range.to, {
    enabled: !!stationId && enabled,
  } as any);
  // Memoised so `kpis` below actually memoises while the query is loading.
  const list = useMemo<DsrRow[]>(() => dssrQ.data ?? [], [dssrQ.data]);
  // Newest day first.
  const rows = useMemo(
    () => [...list].sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate))),
    [list],
  );
  // Read through the shared DSSR reader (#516): the component never sums raw keys.
  const kpis = useMemo(() => deriveDssrRangeKpis(list), [list]);

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-[150px]">
              <Input
                type="date"
                inputSize="sm"
                aria-label="Business date to generate"
                value={generateDate}
                onChange={(e) => onGenerateDateChange(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Play className="fill-current" />}
              loading={generating}
              disabled={!generateDate}
              onClick={onGenerate}
            >
              Generate DSR
            </Button>
          </div>
        }
        info={
          <InfoTip label="About the DSR list" placement="bottom">
            A DSR is the frozen sales report of one business day, made when the day closes or on
            demand with Generate. Cash sales are what the shift drawers received for sales;
            collections are office records and live in the Daily cash book.
          </InfoTip>
        }
      />
      {generateError && (
        <p role="alert" className="m-0 text-[12px] text-danger-fg">
          {generateError}
        </p>
      )}

      <DataSection title="DSR totals" query={dssrQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile label="Generated DSRs" scope="in-range" value={String(kpis.count)} />
          <KpiTile label="Net volume sold" scope="in-range" value={kpis.volumeLabel} />
          {/* Cash received for sales by shift Drawers. Collections are Office
              Records (ADR 0005) and live in the Daily Cash Book. */}
          <KpiTile
            label="Cash sales"
            scope="in-range"
            value={kpis.cashSales == null ? '—' : formatMoney(kpis.cashSales)}
            hint={
              kpis.daysWithoutCash > 0
                ? `${countOf(kpis.daysWithoutCash, 'older day', 'older days')} not counted`
                : undefined
            }
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Daily reports" />
        <DataSection
          title="daily reports"
          query={dssrQ}
          placeholderHeight={160}
          flush
          isEmpty={list.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="zap" size="md" />}
                title="No DSRs in this period"
                description="A DSR is made when a business day closes, or pick a date and Generate DSR."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            title="daily reports"
            onRowClick={onOpen}
            rowLabel={(r) => `DSR ${formatDate(r.businessDate)}`}
            totalRow={{ label: 'Total' }}
          />
        </DataSection>
      </section>
    </div>
  );
};
