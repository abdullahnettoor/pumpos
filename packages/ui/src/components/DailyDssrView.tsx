import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DSR_FULL_NAME, DSR_LABEL, canExportReports, resolveBusinessDate } from '@pump/shared';
import type { Role } from '@pump/shared';
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
import { invalidateAfterDssrGenerate, useDailyDssrPreview } from '../query/hooks.js';
import { CloudShiftService } from '../services/cloud.js';
import { formatBusinessDate, formatDateTime } from '../utils/format.js';
import { useRunTask } from '../utils/runTask.js';
import { officeSubmitKeys } from '../office-records/submitKeys.js';
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
  DSSR_COGS_NOTE,
  DSSR_EMPTY,
  DSSR_TITLES,
  attendantTotalNotes,
  attendantTotalRow,
  fuelTotalNotes,
  shiftColumns,
  shiftTotalNotes,
  totalNote,
  dssrTiles,
  fuelTotalRow,
  shiftTotalRow,
} from './reports/dssr/dssrColumns.js';

const shiftService = new CloudShiftService();

interface DailyDssrViewProps {
  /**
   * The DSR the Reports page opened: a stored snapshot row or a preview. A row
   * with no `snapshotData` (just `{ businessDate }`) names the day only; the
   * screen then reads it like any other day.
   */
  dailyDssr: any;
  onBack?: () => void;
  station?: any;
  /** Generate DSR shows only to Roles the generate route allows (`canExportReports`). */
  userRole?: Role;
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
export const DailyDssrView: React.FC<DailyDssrViewProps> = ({
  dailyDssr,
  onBack,
  station,
  userRole,
}) => {
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
  // The opened row is shown as handed over, without a read. It is always a real
  // DSR (a snapshot or a preview), never the Report missing state: that state
  // only comes from reading another day, and Generate DSR only shows there. So
  // generating never leaves the opened row stale; it refreshes the day it ran
  // on through the preview key below. A row without figures is read like any day.
  const onOpenedDay = date === openedDate && !!dailyDssr?.snapshotData;

  const dayQ = useDailyDssrPreview(stationId, date, {
    enabled: !!stationId && !onOpenedDay,
    // A missing report is an answer, not a fault: asking again changes nothing.
    retry: (count, error) => !isReportMissing(error) && count < 1,
  });
  const missing = !onOpenedDay && dayQ.isError && isReportMissing(dayQ.error);
  const row: DssrRow | null = onOpenedDay ? (dailyDssr ?? null) : (dayQ.data ?? null);
  const day = useMemo(() => (row ? readDssrDay(row) : null), [row]);
  const status = row ? dssrDayStatus(row, date, currentBusinessDate) : null;

  const canGenerate = !!stationId && !!userRole && canExportReports(userRole);
  const generate = useMutation({
    // The day is the mutation's own variable, never the screen's current date:
    // the operator may step to another day while Generate is still in flight.
    // One Idempotency-Key per logical generate: a retry after a dropped
    // response reuses it, so the snapshot cannot be generated twice.
    mutationFn: async (day: { stationId: string; date: string }) => {
      const keys = officeSubmitKeys.session('dssr:generate');
      const idempotencyKey = keys.next(
        JSON.stringify({ stationId: day.stationId, businessDate: day.date }),
      );
      try {
        const result: unknown = await shiftService.generateDailyDssr(day.stationId, day.date, {
          idempotencyKey,
        });
        keys.settle();
        return result;
      } catch (error) {
        keys.settle(error);
        throw error;
      }
    },
    // Synchronous on purpose (pump-data-caching rule 6): the screen shows the
    // write's own response at once, and the refreshes run in the background.
    // Returning them would keep Generate spinning until every refetch lands.
    onSuccess: (generated, day) =>
      invalidateAfterDssrGenerate(qc, day.stationId, day.date, generated),
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
      // The DSR is a view inside /reports, not a route of its own: the entry
      // behind it in history is not the Reports list, so back closes the view
      // (onBack) instead of history.back().
      back={onBack && { label: 'Reports', href: `#${ROUTES.reports}`, onClick: onBack }}
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
              description={`${formatBusinessDate(date)} is closed, but its ${DSR_LABEL} was never generated.${canGenerate ? '' : ' An owner, manager or accountant can generate it.'}`}
              action={
                canGenerate && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={generate.isPending}
                    onClick={() =>
                      runTask(
                        generate.mutateAsync({ stationId, date }),
                        `Could not generate the ${DSR_LABEL}.`,
                      )
                    }
                  >
                    Generate {DSR_LABEL}
                  </Button>
                )
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
  const shiftCols = useMemo(() => shiftColumns(day), [day]);
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
          {dssrTiles(day).map((tile) => (
            <KpiTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
          ))}
        </KpiStrip>
        <ReportNote>{DSSR_COGS_NOTE}</ReportNote>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeader title={DSSR_TITLES.sales} />
        <FigureList lines={day.sales} label={DSSR_TITLES.sales} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title={DSSR_TITLES.fuel} />
        <InteractiveTable
          columns={FUEL_PRODUCT_COLUMNS}
          rows={day.fuel.rows}
          rowKey={(r) => r.key}
          totalRow={fuelTotalRow(day.fuel)}
          title="fuel sales"
          emptyMessage={DSSR_EMPTY.fuel}
        />
        <TotalNote rows={day.fuel.rows.length} notes={fuelTotalNotes(day.fuel)} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title={DSSR_TITLES.nozzles} subtitle={DSSR_TITLES.nozzlesSubtitle} />
        <InteractiveTable
          columns={NOZZLE_COLUMNS}
          rows={day.nozzles}
          rowKey={(r) => r.key}
          title="nozzles"
          emptyMessage={DSSR_EMPTY.nozzles}
        />
      </section>

      {day.fuelStock.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title={DSSR_TITLES.fuelStock} />
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
          <SectionHeader title={DSSR_TITLES.merchandiseStock} />
          <InteractiveTable
            columns={MERCHANDISE_STOCK_COLUMNS}
            rows={day.merchandiseStock}
            rowKey={(r) => r.key}
            title="product stock variance"
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader title={DSSR_TITLES.shifts} />
        <InteractiveTable
          columns={shiftCols}
          rows={day.shifts}
          rowKey={(r) => r.key}
          totalRow={shiftTotalRow(day)}
          title="included shifts"
          emptyMessage={DSSR_EMPTY.shifts}
        />
        <TotalNote rows={day.shifts.length} notes={shiftTotalNotes(day)} />
      </section>

      {/* Attendant (Handover) variance per Attendant/DU for the day (#287). */}
      {day.attendants.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title={DSSR_TITLES.attendants} subtitle={DSSR_TITLES.attendantsSubtitle} />
          <InteractiveTable
            columns={ATTENDANT_COLUMNS}
            rows={day.attendants}
            rowKey={(r) => r.key}
            totalRow={attendantTotalRow(day)}
            title="attendant variance"
          />
          <TotalNote rows={day.attendants.length} notes={attendantTotalNotes(day)} />
        </section>
      )}
    </div>
  );
};

/**
 * Why a total row shows `—` or a blank, as one full-width line under the
 * table; the PDF prints the same line. Only under a table with rows, where
 * the total row shows.
 */
const TotalNote: React.FC<{ rows: number; notes: string[] }> = ({ rows, notes }) => {
  const note = rows > 0 ? totalNote(notes) : null;
  return note ? <ReportNote className="max-w-none">{note}</ReportNote> : null;
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
