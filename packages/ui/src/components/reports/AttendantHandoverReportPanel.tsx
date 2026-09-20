import React, { useMemo, useState } from 'react';
import { useAttendantHandoverReport } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState, Icon } from '../../pump-ds/index.js';
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
export const AttendantHandoverReportPanel: React.FC<AttendantHandoverReportPanelProps> = ({
  selectedStation,
}) => {
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
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
        note="Closed shifts only. Variance is the attendant's net shortage or excess for the period."
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
                    <th style={thR}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {attendants.map((a: any) => (
                    <tr
                      key={a.attendantId}
                      style={{ borderBottom: '1px solid var(--border-soft)' }}
                    >
                      <td style={td}>{a.attendantName}</td>
                      <td style={tdR}>{a.shiftsWorked}</td>
                      <td style={tdR}>{inr(a.totals.cashHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.cardHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.upiHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.creditHandedOver)}</td>
                      <td style={tdR}>{inr(a.totals.expectedFuelSales)}</td>
                      <td style={{ ...tdR, color: varianceTone(Number(a.totals.varianceAmount)) }}>
                        {inr(a.totals.varianceAmount)}
                      </td>
                    </tr>
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
