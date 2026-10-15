import React, { useMemo } from 'react';
import type {
  AttendantReportDispenser,
  AttendantReportEntry,
  AttendantReportShift,
} from '@pump/shared';
import { shiftDisplayLabel } from '@pump/shared';
import {
  creditChitRows,
  shiftShowsCreditBreakdown,
  type CreditChitRow,
} from '../../../services/reports/attendantCreditLines.js';
import { groupShiftsByBusinessDay } from '../../../services/reports/attendantStatementDays.js';
import type { DateRange } from '../../../pump-ds/date-range/index.js';
import { Drawer } from '../../Drawer.js';
import {
  formatBusinessDate,
  formatDateSpan,
  formatDateTime,
  formatMoney,
} from '../../../utils/format.js';
import { formatVariance } from '../../../utils/variance.js';
import {
  Button,
  EmptyState,
  Icon,
  KpiStrip,
  KpiTile,
  Panel,
  SectionHeader,
  StatementTable,
  VarianceChip,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { varianceAlert } from './attendantColumns.js';

/**
 * A nozzle meter reading: litres to 3 places. Readings never add up: a total
 * of opening and closing readings means nothing.
 */
const READING = { kind: 'qty', unit: 'L', decimals: 3, total: false } as const;

type Nozzle = AttendantReportDispenser['nozzles'][number];
type Terminal = AttendantReportDispenser['terminals'][number];

// Meter readings to 3 places in litres, as the exported PDF prints them.
const NOZZLE_COLUMNS: TableColumn<Nozzle>[] = [
  { id: 'nozzle', header: 'Nozzle', kind: 'text', value: (n) => n.nozzleName },
  { id: 'product', header: 'Product', kind: 'text', value: (n) => n.productName },
  { ...READING, id: 'opening', header: 'Opening', value: (n) => n.openingReading },
  { ...READING, id: 'closing', header: 'Closing', value: (n) => n.closingReading },
  { ...READING, id: 'volume', header: 'Volume', emphasis: true, value: (n) => n.volumeSold },
  { ...READING, id: 'testing', header: 'Testing', value: (n) => n.testingVolume },
];

const TERMINAL_COLUMNS: TableColumn<Terminal>[] = [
  { id: 'terminal', header: 'Terminal', kind: 'text', value: (t) => t.terminalName },
  { id: 'batch', header: 'Batch', kind: 'text', value: (t) => t.batchRef },
  { id: 'card', header: 'Card', kind: 'money', value: (t) => t.cardAmount },
  { id: 'upi', header: 'UPI', kind: 'money', value: (t) => t.upiAmount },
];

const CREDIT_COLUMNS: TableColumn<CreditChitRow>[] = [
  { id: 'customer', header: 'Customer', kind: 'text', value: (r) => r.customerName },
  { id: 'vehicle', header: 'Vehicle', kind: 'text', value: (r) => r.vehicle },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  // A volume, not a meter reading: the unit's own decimals (2 for litres).
  // Chits reconcile by amount; the quantity column is not totalled.
  {
    id: 'qty',
    header: 'Qty',
    kind: 'qty',
    unit: (r) => r.unit,
    total: false,
    value: (r) => r.quantityValue,
  },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
];

/** A block's small heading inside a shift card: the DU, or "Fuel-on-credit". */
const BlockLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[12px] font-semibold text-ink-strong">{children}</span>
);

const DispenserDetail: React.FC<{ dispenser: AttendantReportDispenser }> = ({ dispenser }) => (
  <div className="mt-2 flex flex-col gap-1">
    <div className="flex items-baseline justify-between gap-2">
      <BlockLabel>{dispenser.duName}</BlockLabel>
      {dispenser.creditSales !== 0 && (
        <span className="font-mono text-[12px] tabular-nums text-ink-muted">
          Credit {formatMoney(dispenser.creditSales)}
        </span>
      )}
    </div>

    <StatementTable
      label={`${dispenser.duName} nozzle readings`}
      columns={NOZZLE_COLUMNS}
      rows={dispenser.nozzles}
      rowKey={(n) => n.nozzleId}
    />

    {dispenser.terminals.length > 0 ? (
      <StatementTable
        label={`${dispenser.duName} payment terminals`}
        columns={TERMINAL_COLUMNS}
        rows={dispenser.terminals}
        rowKey={(t) => t.terminalId}
      />
    ) : (
      // A station declaring aggregate card/UPI has no per-terminal batches to
      // show; saying so beats an empty table the operator has to interpret.
      <p className="m-0 px-2 text-[12px] text-ink-faint">
        Aggregate declaration — card {formatMoney(dispenser.cardHandedOver)}, UPI{' '}
        {formatMoney(dispenser.upiHandedOver)}
      </p>
    )}
  </div>
);

/**
 * Who owes the shift's fuel-on-credit. The chits sum to the shift's credit
 * total by construction, so the total is printed beneath them as the same
 * figure the shift line already showed — not a second, re-derived number.
 *
 * Which rows appear, and how each cell reads, come from
 * `attendantCreditLines` — the same source the exported PDF renders from, so
 * the drawer and the export cannot teach the operator two different statements
 * (#244). That shared rule is why a shift carrying a credit total with no
 * chits shows a placeholder row here instead of nothing at all.
 */
const CreditBreakdown: React.FC<{ shift: AttendantReportShift }> = ({ shift }) => {
  if (!shiftShowsCreditBreakdown(shift)) return null;
  const rows = creditChitRows(shift);
  return (
    <div className="mt-3 flex flex-col gap-1">
      <BlockLabel>Fuel-on-credit</BlockLabel>
      <StatementTable
        label="Fuel-on-credit chits"
        columns={CREDIT_COLUMNS}
        rows={rows}
        rowKey={(r) => r.key}
        totalRow={{ values: { amount: shift.creditSales } }}
      />
    </div>
  );
};

/**
 * One Shift of the statement: its variance, its sales components, then the
 * dispensers it was handed over from and the credit it raised.
 *
 * A Panel per Shift, nested under the Business Day it belongs to — the same
 * structure the exported PDF prints, so the drawer and the export never teach
 * the operator two different shapes for one statement.
 */
const ShiftCard: React.FC<{ shift: AttendantReportShift }> = ({ shift }) => (
  <Panel
    // The shift's readable name (#228) names the card; closing time stays
    // because it answers a different question — when it was reconciled.
    title={
      <span className="flex items-baseline gap-2">
        {shift.shiftTemplateName ?? 'Shift'}
        <span className="font-mono text-[12px] font-normal text-ink-muted">
          {shiftDisplayLabel(shift)}
        </span>
        {shift.closedAt && (
          <span className="font-mono text-[12px] font-normal text-ink-muted">
            closed {formatDateTime(shift.closedAt)}
          </span>
        )}
      </span>
    }
    action={<VarianceChip amount={shift.varianceAmount} size="md" />}
  >
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-muted">
      <span>Billed {formatMoney(shift.billedSales)}</span>
      <span>Merch. handover {formatMoney(shift.handoverProductSales)}</span>
      <span>Credit {formatMoney(shift.creditSales)}</span>
      <span>Fuel expected {formatMoney(shift.expectedFuelSales)}</span>
    </div>

    {shift.dispensers.map((dispenser) => (
      <DispenserDetail key={dispenser.handoverId} dispenser={dispenser} />
    ))}

    <CreditBreakdown shift={shift} />
  </Panel>
);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One Attendant's statement: range KPIs, then a section per Business Day.
 *
 * Mirrors the exported PDF — cover figures first, then the days — because the
 * drawer is where the operator decides whether the export is worth sending.
 * The range and "closed shifts only" sit under the title, so the four tiles
 * need no period chip of their own.
 */
export const AttendantDetailDrawer: React.FC<{
  attendant: AttendantReportEntry | null;
  range: DateRange;
  onClose: () => void;
  onExport: () => void;
}> = ({ attendant, range, onClose, onExport }) => {
  const days = useMemo(
    () => (attendant ? groupShiftsByBusinessDay(attendant.shifts) : []),
    [attendant],
  );
  const totals = attendant?.totals;

  return (
    <Drawer
      isOpen={attendant !== null}
      onClose={onClose}
      title={attendant ? `${attendant.attendantName} — handovers` : 'Handovers'}
      subtitle={`${formatDateSpan(range.from, range.to)} · closed shifts only`}
      widthVariant="wide"
      footer={
        <Button
          size="sm"
          variant="secondary"
          onClick={onExport}
          leftIcon={<Icon name="download" size="xs" aria-hidden="true" />}
        >
          Export statement
        </Button>
      }
    >
      {attendant && totals && (
        <div className="flex flex-col gap-3">
          {/* Shifts worked moved into the cash tile's hint: the day sections
              below count them again, one heading each. */}
          <KpiStrip>
            <KpiTile
              size="sm"
              label="Net variance"
              value={formatVariance(totals.varianceAmount, 'cash').text}
              alert={varianceAlert(totals.varianceAmount)}
            />
            <KpiTile
              size="sm"
              label="Cash handed over"
              value={formatMoney(totals.cashHandedOver)}
              hint={`over ${plural(attendant.shiftsWorked, 'shift', 'shifts')}`}
            />
            <KpiTile
              size="sm"
              label="Card + UPI"
              value={formatMoney(totals.cardHandedOver + totals.upiHandedOver)}
            />
            <KpiTile size="sm" label="Fuel-on-credit" value={formatMoney(totals.creditSales)} />
          </KpiStrip>

          {days.map((day) => (
            <section key={day.businessDate} className="flex flex-col gap-2">
              <SectionHeader
                title={formatBusinessDate(day.businessDate)}
                subtitle={plural(day.shifts.length, 'shift', 'shifts')}
              />
              {day.shifts.map((shift) => (
                <ShiftCard key={shift.shiftId} shift={shift} />
              ))}
            </section>
          ))}

          {days.length === 0 && (
            <EmptyState
              title="No handovers"
              description="This attendant has no closed-shift handovers in the selected range."
            />
          )}
        </div>
      )}
    </Drawer>
  );
};
