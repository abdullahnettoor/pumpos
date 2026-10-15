import React, { useMemo, useState } from 'react';
import { countOf } from '../../utils/ledgerWindow.js';
import type { AttendantHandoverReport, AttendantReportEntry } from '@pump/shared';
import { ATTENDANT_REPORT_CAPABILITY } from '@pump/shared';
import { useAttendantHandoverReport } from '../../query/hooks.js';
import { computeRange } from '../../pump-ds/date-range/index.js';
import type { DateRange } from '../../pump-ds/date-range/index.js';
import { formatVariance } from '../../utils/variance.js';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  Select,
  type TotalRow,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { attendantTotals } from './totals/reportTotals.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { CapabilityRoute } from '../../access/CapabilityGate.js';
import { generateAttendantReportPdf } from '../../services/reports/generate.js';
import { useRunTask } from '../../utils/runTask.js';
import { AttendantDetailDrawer } from './attendant/AttendantDetailDrawer.js';
import { ATTENDANT_COLUMNS, varianceAlert, varianceSpread } from './attendant/attendantColumns.js';

export interface AttendantHandoverReportPanelProps {
  selectedStation: { id: string; name?: string; settings?: Record<string, unknown> } | null;
}

/** Every figure comes from closed shifts; an open shift is not in the report yet. */
// Variance is not added up across attendants (see ATTENDANT_COLUMNS).
const TOTAL_ROW: TotalRow = { label: 'Total excl. variance' };

/**
 * Attendant Handover Report — per-Attendant accountability across a
 * Business-Date range. One row per Attendant, composed from the Handovers of
 * that station's CLOSED Shifts, so every figure is final.
 *
 * Layout A (#567): the range bar drives the tiles and the list below it. The
 * list's total row carries the money columns; the tiles carry what the table
 * does not total (the head count, and the net variance beside who was short).
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

  const totals = useMemo(() => attendantTotals(attendants), [attendants]);

  const openAttendant = attendants.find((a) => a.attendantId === openAttendantId) ?? null;

  // Only reachable over a loaded report, so the statement always carries the
  // instant its figures were composed.
  const exportStatement = (entry: AttendantReportEntry | null) => {
    if (!entry || !report) return;
    runTask(
      generateAttendantReportPdf(selectedStation, entry, {
        from: range.from,
        to: range.to,
        generatedAt: report.generatedAt,
      }),
      'Could not export the attendant statement.',
    );
  };

  if (!selectedStation) {
    return (
      <p className="m-0 p-6 text-[13px] text-ink-muted">
        Please select a station to view the attendant handover report.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        info={
          <InfoTip label="About attendant handovers" placement="bottom">
            Closed shifts only. Sales components are listed separately — fuel expected is metered,
            not a grand total. Open an attendant to see their shifts and export their statement.
          </InfoTip>
        }
        filters={
          <Select
            inputSize="sm"
            className="h-8 min-w-[180px]"
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
        }
      />

      <DataSection title="Attendant totals" query={reportQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto" scope="in-range">
          <KpiTile
            label="Attendants"
            value={String(attendants.length)}
            hint={`${countOf(totals.shifts, 'shift', 'shifts')} closed`}
          />
          <KpiTile
            label="Net variance"
            value={formatVariance(totals.variance, 'cash').text}
            alert={varianceAlert(totals.variance)}
            hint={varianceSpread(attendants)}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Attendant handovers" />
        <DataSection
          title="Attendant handovers"
          query={reportQ}
          placeholderHeight={160}
          flush
          isEmpty={attendants.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="users" size="md" />}
                title="No handovers in this period"
                description="Attendant handovers appear here once their shift is closed."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            dense
            columns={ATTENDANT_COLUMNS}
            rows={attendants}
            rowKey={(a) => a.attendantId}
            totalRow={TOTAL_ROW}
            title="attendant handovers"
            onRowClick={(a) => setOpenAttendantId(a.attendantId)}
            rowLabel={(a) => `${a.attendantName} handovers`}
          />
        </DataSection>
      </section>

      <AttendantDetailDrawer
        attendant={openAttendant}
        range={range}
        onClose={() => setOpenAttendantId(null)}
        onExport={() => exportStatement(openAttendant)}
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
