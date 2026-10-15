import React, { useEffect, useMemo, useState } from 'react';
import { useMerchandiseHandovers, useMerchandiseSales } from '../../query/hooks.js';
import { formatMoney } from '../../utils/format.js';
import { BeforeCloseChecklist } from './BeforeCloseChecklist.js';
import type { BilledSaleRecord, HandoverSaleRecord } from './HandoverProductSaleDrawer.js';
import { LiveShiftBar } from './LiveShiftBar.js';
import { LiveShiftTiles } from './LiveShiftTiles.js';
import {
  liveShiftFigures,
  liveShiftState,
  type CheckAction,
  type HandoverProductSaleInput,
  type PreHandoverTotals,
  type ShiftInput,
  type StaffAssignmentInput,
} from './liveShiftModel.js';
import { NozzleReadingsTable } from './NozzleReadingsTable.js';
import { ProductSalesSection } from './ProductSalesSection.js';
import { TakingsSummary } from './TakingsSummary.js';

/** The open shift as the shift-status payload carries it. */
export interface LiveShift extends ShiftInput {
  id: string;
  templateName: string;
  businessDate: string;
  openedByName?: string | null;
  merchandiseHandovers?: (HandoverSaleRecord & HandoverProductSaleInput)[];
  merchandiseSales?: BilledSaleRecord[];
}

export interface LiveShiftViewProps {
  shift: LiveShift;
  stationId: string | null;
  timeZone?: string;
  currentBusinessDate: string;
  /** Declared cash sales from the close-shift cash summary. */
  cashDeclared: number;
  /** Card / UPI / credit before any Handover (the shift's own totals). */
  before: PreHandoverTotals;
  closing: boolean;
  canClose: boolean;
  onOpenHandover: (assignment: StaffAssignmentInput) => void;
  onStartClose: () => void;
}

const money = (v: number) => formatMoney(v, { decimals: 0 });

/** The clock, read every 30 s: it decides Live vs Past scheduled end, Pending vs due. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The Live shift tab (#533, layout B): the shift bar, four "This shift" tiles,
 * then the nozzle readings grouped by Drawer and the Product sales on the
 * left, the takings and the Before close checklist on the right. Every figure
 * comes from `liveShiftFigures`.
 */
export const LiveShiftView: React.FC<LiveShiftViewProps> = ({
  shift,
  stationId,
  timeZone,
  currentBusinessDate,
  cashDeclared,
  before,
  closing,
  canClose,
  onOpenHandover,
  onStartClose,
}) => {
  const handoversQ = useMerchandiseHandovers(
    shift.id,
    shift.merchandiseHandovers ? { initialData: shift.merchandiseHandovers } : undefined,
  );
  const billedQ = useMerchandiseSales(
    shift.id,
    shift.merchandiseSales ? { initialData: shift.merchandiseSales } : undefined,
  );
  const handoverSales: (HandoverSaleRecord & HandoverProductSaleInput)[] = useMemo(
    () => handoversQ.data ?? [],
    [handoversQ.data],
  );
  const billed: BilledSaleRecord[] = useMemo(() => billedQ.data ?? [], [billedQ.data]);

  const now = useNow();
  const figures = useMemo(
    () =>
      liveShiftFigures({
        shift,
        cashDeclared,
        before,
        handoverSales,
        billed,
        now,
        timeZone,
        formatMoney: money,
      }),
    [shift, cashDeclared, before, handoverSales, billed, now, timeZone],
  );

  const onAction = (action: CheckAction) => {
    if (action.kind === 'close') return onStartClose();
    const group = figures.groups.find((g) => g.key === action.groupKey);
    if (group?.assignment) onOpenHandover(group.assignment);
  };

  return (
    <div className="flex flex-col gap-4">
      <LiveShiftBar
        templateName={shift.templateName}
        state={liveShiftState(shift, now, timeZone)}
        openedAt={shift.openedAt}
        openedByName={shift.openedByName}
        scheduledEndTime={shift.scheduledEndTime}
        businessDate={shift.businessDate}
        currentBusinessDate={currentBusinessDate}
        timeZone={timeZone}
        handoversRecorded={figures.drawers.recorded}
        handoversExpected={figures.drawers.expected}
        closing={closing}
      />
      <LiveShiftTiles figures={figures} productQueries={[handoversQ, billedQ]} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <NozzleReadingsTable
            groups={figures.groups}
            pending={figures.pending}
            timeZone={timeZone}
            onOpenHandover={onOpenHandover}
          />
          <ProductSalesSection
            shiftId={shift.id}
            stationId={stationId}
            queries={[handoversQ, billedQ]}
            sales={figures.products}
            handoverSales={handoverSales}
            billed={billed}
          />
        </div>
        <aside className="flex flex-col gap-4" aria-label="Shift so far">
          <TakingsSummary
            takings={figures.takings}
            recorded={figures.drawers.recorded}
            expected={figures.drawers.expected}
            pending={figures.pending}
          />
          <BeforeCloseChecklist items={figures.checklist} onAction={onAction} canClose={canClose} />
        </aside>
      </div>
    </div>
  );
};
