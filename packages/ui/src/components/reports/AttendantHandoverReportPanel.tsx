import React, { useMemo, useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import type {
  AttendantHandoverReport,
  AttendantReportDispenser,
  AttendantReportEntry,
  AttendantReportShift,
} from '@pump/shared';
import { ATTENDANT_REPORT_CAPABILITY } from '@pump/shared';
import { useAttendantHandoverReport } from '../../query/hooks.js';
import {
  creditChitRows,
  shiftShowsCreditBreakdown,
} from '../../services/reports/attendantCreditLines.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { Field, Select } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import { formatDateTime, formatQty, inr } from '../../utils/format.js';
import {
  KpiStrip,
  KpiTile,
  Panel,
  EmptyState,
  Icon,
  Button,
  Chip,
  StatementTable,
} from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { CapabilityRoute } from '../../access/CapabilityGate.js';
import { generateAttendantReportPdf } from '../../services/reports/generate.js';
import { groupShiftsByBusinessDay } from '../../services/reports/attendantStatementDays.js';
import { useRunTask } from '../../utils/runTask.js';

export interface AttendantHandoverReportPanelProps {
  selectedStation: { id: string; name?: string; settings?: Record<string, unknown> } | null;
}

/*
 * Styles for the attendants summary table only — a navigational list (clickable
 * rows opening the drawer), not a statement, so it is deliberately not the
 * read-only `StatementTable`. Replacing it is a `DataTable` job of its own.
 */
const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-default)' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' };

/**
 * Variance reads as money owed either way, so its sign carries the meaning.
 * One reading, expressed as a design-system tone; the summary table below is
 * still inline-styled markup, so it maps that tone to its own colour rather
 * than deciding the sign a second time.
 */
type VarianceTone = 'danger' | 'success' | 'neutral';

const varianceTone = (amount: number): VarianceTone =>
  amount < 0 ? 'danger' : amount > 0 ? 'success' : 'neutral';

const TONE_COLOR: Record<VarianceTone, string> = {
  danger: 'var(--text-danger)',
  success: 'var(--text-success)',
  neutral: 'var(--text-muted)',
};

const DispenserDetail: React.FC<{ dispenser: AttendantReportDispenser }> = ({ dispenser }) => (
  <div className="mt-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold text-ink-strong">{dispenser.duName}</span>
      {dispenser.creditSales !== 0 && (
        <Chip tone="info" size="xs" variant="soft">
          Credit {inr(dispenser.creditSales)}
        </Chip>
      )}
    </div>

    <StatementTable
      label={`${dispenser.duName} nozzle readings`}
      columns={[
        { header: 'Nozzle', cell: (n) => n.nozzleName },
        { header: 'Product', cell: (n) => n.productName ?? '—' },
        { header: 'Opening', align: 'right', cell: (n) => formatQty(n.openingReading, 3) },
        { header: 'Closing', align: 'right', cell: (n) => formatQty(n.closingReading, 3) },
        {
          header: 'Volume',
          align: 'right',
          strong: true,
          cell: (n) => formatQty(n.volumeSold, 3),
        },
        { header: 'Testing', align: 'right', cell: (n) => formatQty(n.testingVolume, 3) },
      ]}
      rows={dispenser.nozzles}
      rowKey={(n) => n.nozzleId}
    />

    {dispenser.terminals.length > 0 ? (
      <StatementTable
        className="mt-1"
        label={`${dispenser.duName} payment terminals`}
        columns={[
          { header: 'Terminal', cell: (t) => t.terminalName },
          { header: 'Batch', cell: (t) => t.batchRef || '—' },
          { header: 'Card', align: 'right', cell: (t) => inr(t.cardAmount) },
          { header: 'UPI', align: 'right', cell: (t) => inr(t.upiAmount) },
        ]}
        rows={dispenser.terminals}
        rowKey={(t) => t.terminalId}
      />
    ) : (
      // A station declaring aggregate card/UPI has no per-terminal batches to
      // show; saying so beats an empty table the operator has to interpret.
      <div className="mt-1 px-2 text-[11px] text-ink-faint">
        Aggregate declaration — card {inr(dispenser.cardHandedOver)}, UPI{' '}
        {inr(dispenser.upiHandedOver)}
      </div>
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
 * chits now shows a placeholder row here instead of nothing at all.
 */
const CreditBreakdown: React.FC<{ shift: AttendantReportShift }> = ({ shift }) => {
  if (!shiftShowsCreditBreakdown(shift)) return null;
  const rows = creditChitRows(shift);
  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold text-ink-strong">Fuel-on-credit</div>
      <StatementTable
        label="Fuel-on-credit chits"
        columns={[
          { header: 'Customer', cell: (r) => r.customerName },
          { header: 'Vehicle', cell: (r) => r.vehicle },
          { header: 'Product', cell: (r) => r.product },
          { header: 'Qty', align: 'right', cell: (r) => r.quantity },
          { header: 'Amount', align: 'right', strong: true, cell: (r) => inr(r.amount) },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
        total={['Total', '', '', '', inr(shift.creditSales)]}
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
    // Closing time disambiguates two shifts of one day on the same template —
    // without it they would read as the same card twice.
    title={
      <span className="flex items-baseline gap-2">
        {shift.shiftTemplateName ?? 'Shift'}
        {shift.closedAt && (
          <span className="font-mono text-[11px] font-normal text-ink-muted">
            closed {formatDateTime(shift.closedAt)}
          </span>
        )}
      </span>
    }
    action={
      <Chip tone={varianceTone(shift.varianceAmount)} size="xs" variant="soft">
        Variance {inr(shift.varianceAmount)}
      </Chip>
    }
  >
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
      <span>Billed {inr(shift.billedSales)}</span>
      <span>Merch. handover {inr(shift.handoverProductSales)}</span>
      <span>Credit {inr(shift.creditSales)}</span>
      <span>Fuel expected {inr(shift.expectedFuelSales)}</span>
    </div>

    {shift.dispensers.map((dispenser) => (
      <DispenserDetail key={dispenser.handoverId} dispenser={dispenser} />
    ))}

    <CreditBreakdown shift={shift} />
  </Panel>
);

/**
 * One Attendant's statement: range KPIs, then a section per Business Day.
 *
 * Mirrors the exported PDF — cover figures first, then the days — because the
 * drawer is where the operator decides whether the export is worth sending.
 */
const AttendantDetailDrawer: React.FC<{
  attendant: AttendantReportEntry | null;
  range: DateRange;
  onClose: () => void;
  onExport: () => void;
}> = ({ attendant, range, onClose, onExport }) => {
  const days = useMemo(
    () => (attendant ? groupShiftsByBusinessDay(attendant.shifts) : []),
    [attendant],
  );

  return (
    <Drawer
      isOpen={attendant !== null}
      onClose={onClose}
      title={attendant ? `${attendant.attendantName} — handovers` : 'Handovers'}
      widthVariant="wide"
      footer={
        <Button size="sm" variant="secondary" onClick={onExport}>
          <Download size={13} /> Export statement
        </Button>
      }
    >
      {attendant && (
        <div className="flex flex-col gap-3">
          <KpiStrip>
            <KpiTile size="sm" label="Shifts" value={String(attendant.shiftsWorked)} />
            <KpiTile
              size="sm"
              label="Cash handed over"
              value={inr(attendant.totals.cashHandedOver)}
            />
            <KpiTile
              size="sm"
              label="Card + UPI"
              value={inr(attendant.totals.cardHandedOver + attendant.totals.upiHandedOver)}
            />
            <KpiTile size="sm" label="Fuel-on-credit" value={inr(attendant.totals.creditSales)} />
            <KpiTile
              size="sm"
              label="Net variance"
              value={inr(attendant.totals.varianceAmount)}
              valueTone={
                attendant.totals.varianceAmount === 0
                  ? undefined
                  : varianceTone(attendant.totals.varianceAmount)
              }
            />
          </KpiStrip>

          <div className="text-[11px] text-ink-muted">
            {range.from} to {range.to} · closed shifts only
          </div>

          {days.map((day) => (
            <section key={day.businessDate} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 border-b border-border-soft pb-1">
                <h3 className="text-[12px] font-semibold text-ink-strong">{day.businessDate}</h3>
                <span className="font-mono text-[11px] text-ink-muted">
                  {day.shifts.length} {day.shifts.length === 1 ? 'shift' : 'shifts'}
                </span>
              </div>
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

/**
 * Attendant Handover Report — per-Attendant accountability across a
 * Business-Date range. One row per Attendant, composed from the Handovers of
 * that station's CLOSED Shifts, so every figure is final.
 *
 * Gated on the `reports.attendant` Product Capability; the server re-checks it
 * on every request, so this component assumes nothing about entitlement.
 */
const AttendantHandoverReportBody: React.FC<AttendantHandoverReportPanelProps> = ({
  selectedStation,
}) => {
  const settings = (selectedStation?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const clock = { timeZone: settings.timezone, dayStartsAt: settings.business_day_starts_at };
  const runTask = useRunTask();
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [attendantId, setAttendantId] = useState<string>('');
  const [openAttendantId, setOpenAttendantId] = useState<string | null>(null);
  const stationId = selectedStation?.id;

  const reportQ = useAttendantHandoverReport({
    stationId,
    from: range.from,
    to: range.to,
  });
  const report: AttendantHandoverReport | undefined = reportQ.data;

  /*
   * The period is fetched once, unfiltered, and the attendant filter is
   * applied to what is already here. The server supports `attendantId`, but
   * asking it again would re-fetch a subset of a payload the client is
   * already holding — and would empty the very list the filter selects from.
   */
  const allAttendants = useMemo(() => report?.attendants ?? [], [report]);
  const attendants = useMemo(
    () =>
      attendantId ? allAttendants.filter((a) => a.attendantId === attendantId) : allAttendants,
    [allAttendants, attendantId],
  );

  const totals = useMemo(
    () =>
      attendants.reduce(
        (acc, a) => ({
          cash: acc.cash + a.totals.cashHandedOver,
          variance: acc.variance + a.totals.varianceAmount,
          shifts: acc.shifts + a.shiftsWorked,
        }),
        { cash: 0, variance: 0, shifts: 0 },
      ),
    [attendants],
  );

  const openAttendant = attendants.find((a) => a.attendantId === openAttendantId) ?? null;

  // Only reachable from the drawer, which only opens over a loaded report —
  // so the statement always carries the instant its figures were composed.
  const exportStatement = (entry: AttendantReportEntry, composedAt: string) =>
    runTask(
      generateAttendantReportPdf(selectedStation, entry, {
        from: range.from,
        to: range.to,
        generatedAt: composedAt,
      }),
      'Could not export the attendant statement.',
    );

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view the attendant handover report.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        note="Closed shifts only. Sales components are listed separately — fuel expected is metered, not a grand total."
        actions={
          <div style={{ minWidth: 180 }}>
            <Field label="Attendant">
              <Select
                value={attendantId}
                onChange={(e) => setAttendantId(e.target.value)}
                aria-label="Filter by attendant"
              >
                <option value="">All attendants</option>
                {allAttendants.map((a) => (
                  <option key={a.attendantId} value={a.attendantId}>
                    {a.attendantName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        }
      />

      <KpiStrip columns="auto">
        <KpiTile
          dot="brand"
          valueTone="brand"
          label="Attendants"
          value={String(attendants.length)}
          hint={`${totals.shifts} shifts`}
        />
        <KpiTile label="Cash handed over" value={inr(totals.cash)} />
        <KpiTile
          dot={totals.variance < 0 ? 'danger' : undefined}
          label="Net variance"
          value={inr(totals.variance)}
          hint={totals.variance < 0 ? 'shortage' : totals.variance > 0 ? 'excess' : 'balanced'}
        />
      </KpiStrip>

      {reportQ.isLoading ? (
        <Panel flush title="Attendant handovers">
          <div style={{ padding: '16px' }}>
            <LoadingSpinner text="Loading attendant handovers…" />
          </div>
        </Panel>
      ) : (
        <Panel flush title="Attendant handovers">
          {attendants.length === 0 ? (
            <div style={{ padding: '12px' }}>
              <EmptyState
                compact
                icon={<Icon name="users" size="md" />}
                title="No handovers in this period"
                description="Attendant handovers appear here once their shift is closed."
              />
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'var(--bg-surface-alt)',
                      borderBottom: '1px solid var(--border-soft)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <th style={th}>Attendant</th>
                    <th style={thR}>Shifts</th>
                    <th style={thR}>Cash</th>
                    <th style={thR}>Card</th>
                    <th style={thR}>UPI</th>
                    <th style={thR}>Credit</th>
                    <th style={thR}>Fuel sales</th>
                    <th style={thR}>Billed</th>
                    <th style={thR}>Merch. handover</th>
                    <th style={thR}>Credit sales</th>
                    <th style={thR}>Variance</th>
                    <th style={{ ...th, width: '20px' }} aria-label="Open detail" />
                  </tr>
                </thead>
                <tbody>
                  {attendants.map((a) => (
                    <tr
                      key={a.attendantId}
                      style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                      onClick={() => setOpenAttendantId(a.attendantId)}
                    >
                      <td style={td}>{a.attendantName}</td>
                      <td style={tdR}>{a.shiftsWorked}</td>
                      <td style={tdR}>{inr(a.totals.cashHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.cardHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.upiHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.creditHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.expectedFuelSales)}</td>
                      <td style={tdR}>{inr(a.totals.billedSales)}</td>
                      <td style={tdR}>{inr(a.totals.handoverProductSales)}</td>
                      <td style={tdR}>{inr(a.totals.creditSales)}</td>
                      <td
                        style={{ ...tdR, color: TONE_COLOR[varianceTone(a.totals.varianceAmount)] }}
                      >
                        {inr(a.totals.varianceAmount)}
                      </td>
                      <td style={td}>
                        <ChevronRight size={13} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <AttendantDetailDrawer
        attendant={openAttendant}
        range={range}
        onClose={() => setOpenAttendantId(null)}
        onExport={() =>
          openAttendant && report && exportStatement(openAttendant, report.generatedAt)
        }
      />
    </div>
  );
};

/**
 * An Organization without the capability gets the explanatory unavailable
 * state rather than silence — the server refuses the request regardless.
 */
export const AttendantHandoverReportPanel: React.FC<AttendantHandoverReportPanelProps> = (
  props,
) => (
  <CapabilityRoute capability={ATTENDANT_REPORT_CAPABILITY}>
    <AttendantHandoverReportBody {...props} />
  </CapabilityRoute>
);
