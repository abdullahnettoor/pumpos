import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DSR_FULL_NAME, DSR_LABEL, resolveBusinessDate } from '@pump/shared';
import {
  Button,
  ControlBar,
  DataSection,
  EmptyState,
  ExportMenu,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  Panel,
  SectionHeader,
  StatusChip,
} from '../pump-ds/index.js';
import { PageFrame } from './page-frame/index.js';
import { ROUTES } from '../nav-intent/routes.js';
import { Banner } from './primitives/Banner.js';
import { InfoTip } from './primitives/InfoTip.js';
import { ReportNote } from './reports/ReportNote.js';
import { DayPicker } from './reports/DayPicker.js';
import { queryKeys, useDailyDssrPreview } from '../query/hooks.js';
import { CloudShiftService } from '../services/cloud.js';
import { formatBusinessDate, formatDateTime, formatMoney } from '../utils/format.js';
import { useRunTask } from '../utils/runTask.js';
import {
  dssrDayStatus,
  readDssrDay,
  type DssrDay,
  type DssrRow,
  type FigureLine,
} from './reports/dssr/dssrModel.js';
import {
  ATTENDANT_COLUMNS,
  FUEL_PRODUCT_COLUMNS,
  FUEL_STOCK_COLUMNS,
  MERCHANDISE_STOCK_COLUMNS,
  NOZZLE_COLUMNS,
  SHIFT_COLUMNS,
  fuelTotalRow,
  shiftTotalRow,
} from './reports/dssr/dssrColumns.js';

const shiftService = new CloudShiftService();

interface DailyDssrViewProps {
  /** The DSR the Reports page opened: a stored snapshot row or a preview. */
  dailyDssr: any;
  onBack?: () => void;
  station?: any;
}

/** A closed day with no stored snapshot (the preview read answers 409). */
const isReportMissing = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 'CONFLICT';

/**
 * DSR (Daily Station Sales Report) for one Business Day, layout A (#532).
 *
 * The page opens on the DSR the Reports page handed over. The day picker in the
 * control bar steps to other days, each read through the DSR preview (the
 * stored snapshot for a closed day, live figures for an open one). The control
 * bar drives everything below it; Export and the info tip sit at its right end.
 */
export const DailyDssrView: React.FC<DailyDssrViewProps> = ({ dailyDssr, onBack, station }) => {
  const runTask = useRunTask();
  const qc = useQueryClient();
  const stationId: string | undefined = station?.id;
  const settings = station?.settings || {};
  const currentBusinessDate = resolveBusinessDate({
    timeZone: settings.timezone,
    dayStartsAt: settings.business_day_starts_at,
  });

  const openedDate: string = dailyDssr?.businessDate ?? dailyDssr?.snapshotData?.businessDate ?? '';
  const [date, setDate] = useState<string>(openedDate || currentBusinessDate);
  const onOpenedDay = date === openedDate;

  const dayQ = useDailyDssrPreview(stationId, date, {
    enabled: !!stationId && !onOpenedDay,
    // A missing report is an answer, not a fault: asking again changes nothing.
    retry: (count, error) => !isReportMissing(error) && count < 1,
  });
  const missing = !onOpenedDay && dayQ.isError && isReportMissing(dayQ.error);
  const row: DssrRow | null = onOpenedDay ? (dailyDssr ?? null) : (dayQ.data ?? null);
  const day = useMemo(() => (row ? readDssrDay(row) : null), [row]);
  const status = row ? dssrDayStatus(row, date, currentBusinessDate) : null;

  const generate = useMutation({
    mutationFn: () => shiftService.generateDailyDssr(stationId!, date),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.dssrPreviewPrefix(stationId!) }),
        qc.invalidateQueries({ queryKey: ['dssr'] }),
        qc.invalidateQueries({ queryKey: ['dssr-range'] }),
        qc.invalidateQueries({ queryKey: queryKeys.businessDayList(stationId!) }),
      ]),
  });

  // Save PDF and Print render the same DssrDoc, so they match page for page (#309).
  // A preview prints with the draft mark, as the screen shows it.
  const printOrSave = async (output: 'save' | 'print') => {
    const { generateDssrPdf } = await import('../services/reports/generate.js');
    await generateDssrPdf(station, { ...row, draft: row?.live === true }, output);
  };

  // The date, then what the state means for the figures. Never the date twice.
  const detail = !day
    ? null
    : status === 'day-sealed'
      ? day.generatedAt && `Generated ${formatDateTime(day.generatedAt)}`
      : 'Figures can change until the day is closed';
  const subtitle = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {status && <StatusChip status={status} size="sm" />}
      <span>
        {formatBusinessDate(date)}
        {detail && ` · ${detail}`}
      </span>
    </span>
  );

  return (
    <PageFrame
      route={ROUTES.reports}
      title={DSR_LABEL}
      subtitle={subtitle}
      actions={
        onBack && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="arrow-left" size="sm" />}
            onClick={onBack}
          >
            Back to Reports
          </Button>
        )
      }
      toolbar={
        <ControlBar
          className="w-full"
          range={
            <DayPicker
              value={date}
              onChange={setDate}
              max={currentBusinessDate}
              aria-label={`${DSR_LABEL} date`}
            />
          }
          exportMenu={
            <ExportMenu
              aria-label={`Export the ${DSR_LABEL}`}
              disabled={!row}
              onPdf={() => runTask(printOrSave('save'), 'Could not create the PDF.')}
              onPrint={() => runTask(printOrSave('print'), `Could not print the ${DSR_LABEL}.`)}
            />
          }
          info={
            <InfoTip label={`About the ${DSR_LABEL}`} placement="bottom">
              {DSR_FULL_NAME}: sales only, for one business day. Collections, expenses, income and
              supplier payments are office records by entry date — see Accounts → Daily cash book.
            </InfoTip>
          }
        />
      }
    >
      <DataSection
        title={`the ${DSR_LABEL}`}
        query={onOpenedDay || missing ? undefined : dayQ}
        enabled={onOpenedDay || missing ? undefined : true}
        shape="cards"
        placeholderHeight={420}
        isEmpty={!day}
        empty={
          missing ? (
            <EmptyState
              icon={<Icon name="report" size="md" />}
              title="Report missing"
              description={`${formatBusinessDate(date)} is closed, but its ${DSR_LABEL} was never generated.`}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  loading={generate.isPending}
                  disabled={!stationId}
                  onClick={() =>
                    runTask(generate.mutateAsync(), `Could not generate the ${DSR_LABEL}.`)
                  }
                >
                  Generate {DSR_LABEL}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Icon name="report" size="md" />}
              title={`No ${DSR_LABEL} for this day`}
              description={`No shift or sale was recorded on ${formatBusinessDate(date)}.`}
            />
          )
        }
      >
        {day && <DssrBody day={day} />}
      </DataSection>
    </PageFrame>
  );
};

/** The report itself: notices, headline tiles, then one section per table. */
const DssrBody: React.FC<{ day: DssrDay }> = ({ day }) => {
  const { margin } = day;
  return (
    <div className="flex flex-col gap-5">
      {(day.lateEntryCount > 0 || day.warnings.length > 0) && (
        <div className="flex flex-col gap-2">
          {day.lateEntryCount > 0 && (
            <Banner severity="warning">
              {day.lateEntryCount} late {day.lateEntryCount === 1 ? 'entry was' : 'entries were'}{' '}
              recorded after day close. The sealed snapshot below was not changed.
            </Banner>
          )}
          {day.warnings.length > 0 && (
            <Banner severity="warning" title="Daily warnings">
              {day.warnings.length === 1 ? (
                day.warnings[0]
              ) : (
                <ul className="m-0 mt-1 list-disc pl-5">
                  {day.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </Banner>
          )}
        </div>
      )}

      {/* The margin statement as tiles: every figure once, none repeating a table total. */}
      <div className="flex flex-col gap-1.5">
        <KpiStrip columns={4}>
          <KpiTile
            label="Shifts included"
            value={String(day.shiftsIncluded)}
            hint="closed shifts"
          />
          <KpiTile
            label="Total revenue"
            value={formatMoney(margin.revenue)}
            hint={`Fuel ${formatMoney(margin.revenueFuel)} · Merchandise ${formatMoney(margin.revenueMerch)}`}
          />
          <KpiTile
            label="Cost of goods sold"
            value={formatMoney(margin.cogs)}
            hint={`Fuel ${formatMoney(margin.cogsFuel)} · Merchandise ${formatMoney(margin.cogsMerch)}`}
          />
          <KpiTile
            label="Gross margin"
            value={formatMoney(margin.grossMargin)}
            hint="Revenue − cost of goods sold"
          />
        </KpiStrip>
        <ReportNote>
          Cost of goods sold uses each product&apos;s weighted-average cost at day close. Fuel VAT
          is output tax (excluded from cost); merchandise cost is pre-tax.
        </ReportNote>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Sales summary" />
        <FigureList lines={day.sales} label="Sales summary" />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Fuel sales by product" />
        <InteractiveTable
          columns={FUEL_PRODUCT_COLUMNS}
          rows={day.fuel.rows}
          rowKey={(r) => r.key}
          totalRow={fuelTotalRow(day.fuel)}
          title="fuel sales"
          emptyMessage={`No fuel sales in the ${DSR_LABEL}.`}
        />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Nozzles" subtitle="Volume by nozzle, across the day's shifts" />
        <InteractiveTable
          columns={NOZZLE_COLUMNS}
          rows={day.nozzles}
          rowKey={(r) => r.key}
          title="nozzles"
          emptyMessage={`No nozzle data in the ${DSR_LABEL}.`}
        />
      </section>

      {day.fuelStock.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Tank dip and fuel stock variance" />
          <InteractiveTable
            columns={FUEL_STOCK_COLUMNS}
            rows={day.fuelStock}
            rowKey={(r) => r.key}
            title="fuel stock variance"
          />
        </section>
      )}

      {day.merchandiseStock.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Merchandise stock variance" />
          <InteractiveTable
            columns={MERCHANDISE_STOCK_COLUMNS}
            rows={day.merchandiseStock}
            rowKey={(r) => r.key}
            title="merchandise stock variance"
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader title="Included shifts" />
        <InteractiveTable
          columns={SHIFT_COLUMNS}
          rows={day.shifts}
          rowKey={(r) => r.key}
          totalRow={shiftTotalRow(day)}
          title="included shifts"
          emptyMessage="No shifts were included for this day."
        />
      </section>

      {/* Attendant (Handover) variance per Attendant/DU for the day (#287). */}
      {day.attendants.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Attendant variance" subtitle="At handover, per attendant and DU" />
          <InteractiveTable
            columns={ATTENDANT_COLUMNS}
            rows={day.attendants}
            rowKey={(r) => r.key}
            totalRow={
              day.drawerTotals.attendantVariance == null
                ? true
                : { values: { variance: day.drawerTotals.attendantVariance } }
            }
            title="attendant variance"
          />
        </section>
      )}
    </div>
  );
};

/**
 * Independent figures (they do not add up), so no total row: a label and a
 * plain amount per line, in two columns on a wide screen.
 */
const FigureList: React.FC<{ lines: FigureLine[]; label: string }> = ({ lines, label }) => (
  <Panel flush>
    <dl aria-label={label} className="m-0 grid grid-cols-1 lg:grid-cols-2">
      {lines.map((line) => (
        <div
          key={line.label}
          className="flex items-baseline justify-between gap-4 border-b border-border-soft px-4 py-2.5 text-[13px] lg:odd:border-r"
        >
          <dt className="text-ink-default">{line.label}</dt>
          <dd className="m-0 font-mono tabular-nums text-ink-strong">{line.value}</dd>
        </div>
      ))}
    </dl>
  </Panel>
);
