import React, { useMemo, useState } from 'react';
import type { DecantationReportVisit } from '@pump/shared';
import { useDecantationReport } from '../../query/hooks.js';
import {
  ControlBar,
  DataSection,
  DateRangeMenu,
  EmptyState,
  ExportMenu,
  Icon,
  SectionHeader,
  computeRange,
  type DateRange,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { useRunTask } from '../../utils/runTask.js';
import { generateDecantationReportPdf } from '../../services/reports/decantationPdf.js';
import type { PdfOutput } from '../../services/exportPdf.js';
import { DecantationProductTotals, DecantationSummary } from './decantation/DecantationSummary.js';
import { DecantationInvoicesTable } from './decantation/DecantationInvoicesTable.js';
import { DecantationVisitsTable } from './decantation/DecantationVisitsTable.js';
import { DecantationVisitDrawer } from './decantation/DecantationVisitDrawer.js';
import { litres } from './decantation/vocabulary.js';

export interface DecantationReportPanelProps {
  selectedStation: {
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
  } | null;
}

/**
 * Reports → Decantations (layout A, #531): one control bar drives the tiles,
 * the per-product and per-invoice tables and the visits list. Each region is
 * a Data Section on the report query; Export prints and saves the same PDF.
 */
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

  const [range, setRange] = useState<DateRange>(() => computeRange('last-30', clock));
  const [activeVisit, setActiveVisit] = useState<DecantationReportVisit | null>(null);
  const runTask = useRunTask();

  const reportQ = useDecantationReport(
    {
      stationId: stationId ?? undefined,
      from: range.from,
      to: range.to,
    },
    { enabled: !!stationId },
  );
  const report = reportQ.data;

  const exportPdf = (output: PdfOutput) => {
    if (!report) return;
    runTask(
      generateDecantationReportPdf(selectedStation, report, output),
      output === 'print'
        ? 'Could not print the decantation report.'
        : 'Could not export the decantation report.',
    );
  };

  const pendingReceived = report?.totals.pendingReceivedQty ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ControlBar
        range={
          <DateRangeMenu
            value={range}
            onChange={setRange}
            clock={clock}
            aria-label="Report period"
          />
        }
        exportMenu={
          <ExportMenu
            onPdf={() => exportPdf('save')}
            onPrint={() => exportPdf('print')}
            disabled={!report || report.visits.length === 0}
          />
        }
        info={
          <InfoTip label="About the decantation report" placement="bottom">
            One row per tanker visit, with its tank dips, invoice reconciliation and chamber checks.
            Transit loss (short chambers, broken seals, unemptied compartments) is kept apart from
            the station&rsquo;s own decantation loss: the underground dip against the invoice. An
            invoice&rsquo;s variance counts once it settles, when every visit it is split across is
            measured.
          </InfoTip>
        }
      />

      <DataSection title="Decantation totals" query={reportQ} shape="cards" placeholderHeight={90}>
        {report && <DecantationSummary totals={report.totals} />}
      </DataSection>

      {report && report.productTotals.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Totals by product" />
          <DataSection title="Totals by product" query={reportQ} placeholderHeight={120} flush>
            <DecantationProductTotals products={report.productTotals} />
          </DataSection>
        </section>
      )}

      {report && report.invoices.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Invoices"
            subtitle={`${report.invoices.length} ${report.invoices.length === 1 ? 'invoice' : 'invoices'}`}
          />
          <DataSection title="Invoices" query={reportQ} placeholderHeight={120} flush>
            <DecantationInvoicesTable invoices={report.invoices} />
          </DataSection>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Tanker unload records"
          subtitle={
            pendingReceived > 0
              ? `${litres(pendingReceived)} received not yet on a settled invoice`
              : undefined
          }
        />
        <DataSection
          title="Tanker unload records"
          query={reportQ}
          placeholderHeight={200}
          flush
          isEmpty={!!report && report.visits.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="truck" size="md" />}
                title="No decantation records found"
                description="No tanker visits were recorded for this station in the selected period."
              />
            </div>
          }
        >
          {report && (
            <DecantationVisitsTable
              visits={report.visits}
              totalReceivedQty={report.totals.totalReceivedQty}
              onSelect={setActiveVisit}
            />
          )}
        </DataSection>
      </section>

      {activeVisit && (
        <DecantationVisitDrawer visit={activeVisit} onClose={() => setActiveVisit(null)} />
      )}
    </div>
  );
};
