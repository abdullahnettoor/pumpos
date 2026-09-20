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
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { Field, Select } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState, Icon, Button } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { CapabilityRoute } from '../../access/CapabilityGate.js';
import { generateAttendantReportPdf } from '../../services/reports/generate.js';
import { useRunTask } from '../../utils/runTask.js';

export interface AttendantHandoverReportPanelProps {
  selectedStation: { id: string; name?: string; settings?: Record<string, unknown> } | null;
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-default)' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' };

/** Variance reads as money owed either way, so its sign carries the meaning. */
const varianceTone = (amount: number): string =>
  amount < 0 ? 'var(--text-danger)' : amount > 0 ? 'var(--text-success)' : 'var(--text-muted)';

const shiftLabel = (shift: AttendantReportShift): string =>
  `${shift.businessDate}${shift.shiftTemplateName ? ` · ${shift.shiftTemplateName}` : ''}`;

const DispenserDetail: React.FC<{ dispenser: AttendantReportDispenser }> = ({ dispenser }) => (
  <div style={{ marginTop: '8px' }}>
    <div style={{ fontSize: '11px', fontWeight: 600 }}>{dispenser.duName}</div>
    {dispenser.nozzles.length > 0 && (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ color: 'var(--text-faint)' }}>
            <th style={th}>Nozzle</th>
            <th style={th}>Product</th>
            <th style={thR}>Opening</th>
            <th style={thR}>Closing</th>
            <th style={thR}>Volume</th>
            <th style={thR}>Testing</th>
          </tr>
        </thead>
        <tbody>
          {dispenser.nozzles.map((n) => (
            <tr key={n.nozzleId}>
              <td style={td}>{n.nozzleName}</td>
              <td style={td}>{n.productName ?? '—'}</td>
              <td style={tdR}>{n.openingReading}</td>
              <td style={tdR}>{n.closingReading}</td>
              <td style={tdR}>{n.volumeSold}</td>
              <td style={tdR}>{n.testingVolume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {dispenser.creditSales !== 0 && (
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
        Fuel-on-credit from this dispenser: {inr(dispenser.creditSales)}
      </div>
    )}
    {dispenser.terminals.length > 0 ? (
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
        {dispenser.terminals.map((t) => (
          <div key={t.terminalId}>
            {t.terminalName}: card {inr(t.cardAmount)}, UPI {inr(t.upiAmount)}
            {t.batchRef ? ` · batch ${t.batchRef}` : ''}
          </div>
        ))}
      </div>
    ) : (
      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
        Aggregate declaration — card {inr(dispenser.cardHandedOver)}, UPI{' '}
        {inr(dispenser.upiHandedOver)}
      </div>
    )}
  </div>
);

/** One attendant's shifts: dispensers, their nozzles, terminals and variance. */
const AttendantDetailDrawer: React.FC<{
  attendant: AttendantReportEntry | null;
  range: DateRange;
  onClose: () => void;
  onExport: () => void;
}> = ({ attendant, range, onClose, onExport }) => (
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {range.from} to {range.to} · {attendant.shiftsWorked} shifts ·{' '}
          <span style={{ color: varianceTone(attendant.totals.varianceAmount) }}>
            net variance {inr(attendant.totals.varianceAmount)}
          </span>
        </div>

        {attendant.shifts.map((shift) => (
          <div
            key={shift.shiftId}
            style={{
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: '12px' }}>{shiftLabel(shift)}</strong>
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: varianceTone(shift.varianceAmount),
                }}
              >
                Variance {inr(shift.varianceAmount)}
              </span>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Billed {inr(shift.billedSales)} · Merch. handover {inr(shift.handoverProductSales)} ·
              Credit {inr(shift.creditSales)} · Fuel expected {inr(shift.expectedFuelSales)}
            </div>

            {shift.dispensers.map((dispenser) => (
              <DispenserDetail key={dispenser.handoverId} dispenser={dispenser} />
            ))}
          </div>
        ))}
      </div>
    )}
  </Drawer>
);

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
    attendantId: attendantId || undefined,
  });
  const report: AttendantHandoverReport | undefined = reportQ.data;
  const attendants = useMemo(() => report?.attendants ?? [], [report]);

  /**
   * Filter options come from an unfiltered read of the same period, so
   * selecting one attendant does not empty the list you selected from.
   */
  const optionsQ = useAttendantHandoverReport({
    stationId,
    from: range.from,
    to: range.to,
  });
  const attendantOptions = useMemo(
    () =>
      (optionsQ.data?.attendants ?? []).map((a) => ({
        value: a.attendantId,
        label: a.attendantName,
      })),
    [optionsQ.data],
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

  const exportStatement = (entry: AttendantReportEntry) =>
    runTask(
      generateAttendantReportPdf(selectedStation, entry, {
        from: range.from,
        to: range.to,
        generatedAt: report?.generatedAt,
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
                {attendantOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
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
                      <td style={{ ...tdR, color: varianceTone(a.totals.varianceAmount) }}>
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
        onExport={() => openAttendant && exportStatement(openAttendant)}
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
