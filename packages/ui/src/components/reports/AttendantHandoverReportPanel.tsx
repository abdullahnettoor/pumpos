import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useAttendantHandoverReport } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState, Icon, Button } from '../../pump-ds/index.js';
import { generateAttendantReportPdf } from '../../services/reports/generate.js';
import { useRunTask } from '../../utils/runTask.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';

export interface AttendantHandoverReportPanelProps {
  selectedStation: any | null;
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-default)' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' };

/** Variance reads as money owed either way, so its sign carries the meaning. */
const varianceTone = (amount: number): string =>
  amount < 0 ? 'var(--text-danger)' : amount > 0 ? 'var(--text-success)' : 'var(--text-muted)';

/**
 * Attendant Handover Report — per-Attendant accountability across a
 * Business-Date range. One row per Attendant, composed from the Handovers of
 * that station's CLOSED Shifts, so every figure is final.
 *
 * Gated on the `reports.attendant` Product Capability; the server re-checks it
 * on every request, so this component assumes nothing about entitlement.
 */
/** Per-shift detail for one attendant: dispensers, their nozzles and terminals. */
const ShiftDetail: React.FC<{ attendant: any; onExport: () => void }> = ({
  attendant,
  onExport,
}) => (
  <tr>
    <td colSpan={12} style={{ padding: 0, backgroundColor: 'var(--bg-surface-alt)' }}>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={onExport}>
            <Download size={13} /> Export statement
          </Button>
        </div>
        {attendant.shifts.map((shift: any) => (
          <div
            key={shift.shiftId}
            style={{
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)',
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '8px',
              }}
            >
              <strong style={{ fontSize: '12px' }}>
                {shift.businessDate}
                {shift.shiftTemplateName ? ` · ${shift.shiftTemplateName}` : ''}
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: varianceTone(Number(shift.varianceAmount)),
                }}
              >
                Variance {inr(shift.varianceAmount)}
              </span>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Billed {inr(shift.billedSales)} · Merch. handover {inr(shift.handoverProductSales)} ·
              Credit {inr(shift.creditSales)} · Fuel expected {inr(shift.expectedFuelSales)}
            </div>

            {shift.dispensers.map((du: any) => (
              <div key={du.handoverId} style={{ marginTop: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600 }}>{du.duName}</div>
                {du.nozzles.length > 0 && (
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
                      {du.nozzles.map((n: any) => (
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
                {du.terminals.length > 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {du.terminals.map((t: any) => (
                      <div key={t.terminalId}>
                        {t.terminalName}: card {inr(t.cardAmount)}, UPI {inr(t.upiAmount)}
                        {t.batchRef ? ` · batch ${t.batchRef}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                    Aggregate declaration — card {inr(du.cardHandedOver)}, UPI{' '}
                    {inr(du.upiHandedOver)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </td>
  </tr>
);

export const AttendantHandoverReportPanel: React.FC<AttendantHandoverReportPanelProps> = ({
  selectedStation,
}) => {
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const runTask = useRunTask();
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  // Expanding reads the detail already held in the report payload — no refetch.
  const [expanded, setExpanded] = useState<string | null>(null);
  const stationId = selectedStation?.id ?? null;

  const reportQ = useAttendantHandoverReport(stationId, range.from, range.to);
  const attendants = useMemo(() => reportQ.data?.attendants ?? [], [reportQ.data]);

  const totals = useMemo(
    () =>
      attendants.reduce(
        (acc: any, a: any) => ({
          cash: acc.cash + Number(a.totals.cashHandedOver || 0),
          variance: acc.variance + Number(a.totals.varianceAmount || 0),
          shifts: acc.shifts + Number(a.shiftsWorked || 0),
        }),
        { cash: 0, variance: 0, shifts: 0 },
      ),
    [attendants],
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
                    <th style={{ ...th, width: '20px' }} aria-label="Expand" />
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
                  </tr>
                </thead>
                <tbody>
                  {attendants.map((a: any) => (
                    <React.Fragment key={a.attendantId}>
                      <tr
                        style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                        onClick={() =>
                          setExpanded((cur) => (cur === a.attendantId ? null : a.attendantId))
                        }
                      >
                        <td style={td}>
                          {expanded === a.attendantId ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </td>
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
                          style={{ ...tdR, color: varianceTone(Number(a.totals.varianceAmount)) }}
                        >
                          {inr(a.totals.varianceAmount)}
                        </td>
                      </tr>
                      {expanded === a.attendantId && (
                        <ShiftDetail
                          attendant={a}
                          onExport={() =>
                            runTask(
                              generateAttendantReportPdf(selectedStation, a, {
                                from: range.from,
                                to: range.to,
                                generatedAt: reportQ.data?.generatedAt,
                              }),
                              'Could not export the attendant statement.',
                            )
                          }
                        />
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};
