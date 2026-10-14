import React, { useMemo, useState } from 'react';
import type { DecantationReport, DecantationReportVisit } from '@pump/shared';
import { useDecantationReport } from '../../query/hooks.js';
import { computeRange } from '../../pump-ds/date-range/index.js';
import type { DateRange } from '../../pump-ds/date-range/index.js';
import { ExportMenu } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';

export interface DecantationReportPanelProps {
  selectedStation: {
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
  } | null;
}

import { DecantationSummary } from './decantation/DecantationSummary.js';
import { DecantationInvoicesTable } from './decantation/DecantationInvoicesTable.js';
import { DecantationVisitsTable } from './decantation/DecantationVisitsTable.js';
import { DecantationVisitDrawer } from './decantation/DecantationVisitDrawer.js';

export interface DecantationReportPanelProps {
  selectedStation: {
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
  } | null;
}

export const DecantationReportPanel: React.FC<DecantationReportPanelProps> = ({
  selectedStation,
}) => {
  const stationId = selectedStation?.id ?? null;
  const s = selectedStation?.settings ?? {};
  const clock = useMemo(
    () => ({
      timeZone: s.timezone as string | undefined,
      dayStartsAt: s.business_day_starts_at as string | undefined,
    }),
    [s.timezone, s.business_day_starts_at],
  );

  const defaultRange = useMemo<DateRange>(() => {
    return computeRange('last-30', clock);
  }, [clock]);

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [activeVisit, setActiveVisit] = useState<DecantationReportVisit | null>(null);

  const reportQ = useDecantationReport(
    {
      stationId: stationId ?? undefined,
      from: range.from,
      to: range.to,
    },
    { enabled: !!stationId },
  );

  const report: DecantationReport | undefined = reportQ.data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        exportMenu={
          <ExportMenu onPrint={handlePrint} disabled={!report || report.visits.length === 0} />
        }
        note="Decantation Report: rows per tanker visit with tank line dips, invoice reconciliation and chamber integrity. Distinguishes transit loss (chamber shortages, broken seals, unemptied compartments) from station underground decantation loss."
      />

      {reportQ.isLoading && (
        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      )}

      {reportQ.error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px',
          }}
        >
          {reportQ.error instanceof Error
            ? reportQ.error.message
            : 'Failed to load Decantation Report'}
        </div>
      )}

      {report && (
        <>
          <DecantationSummary report={report} />
          <DecantationInvoicesTable invoices={report.invoices} />
          <DecantationVisitsTable visits={report.visits} onSelect={setActiveVisit} />
        </>
      )}

      {activeVisit && (
        <DecantationVisitDrawer visit={activeVisit} onClose={() => setActiveVisit(null)} />
      )}
    </div>
  );
};
