import React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  DataSection,
  EmptyState,
  ExportMenu,
  Icon,
  Panel,
  SectionHeader,
  StatementTable,
  StatusChip,
  VarianceChip,
  type SectionQuery,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { Unlock } from 'lucide-react';
import { CloudShiftService } from '../../services/cloud.js';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { Banner } from '../primitives/Banner.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast, withNextStep } from '../primitives/ToastProvider.js';
import { ReportNote } from '../reports/ReportNote.js';
import { useRunTask } from '../../utils/runTask.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';
import { ShiftTransactionsPanel } from './ShiftTransactionsPanel.js';
import { LegacyPurchasesTable } from './LegacyPurchasesTable.js';
import { DrawerReconciliationTable } from './DrawerReconciliationTable.js';
import {
  businessDayContext,
  creditTotalNotes,
  fuelTotalNotes,
  readShiftSummary,
  totalNote,
  volumeTotalNotes,
  type CashLine,
  type ShiftSummary,
} from './shiftSummaryModel.js';
import {
  CREDIT_COLUMNS,
  FUEL_COLUMNS,
  HANDOVER_COLUMNS,
  NOZZLE_COLUMNS,
  NOZZLES_EMPTY,
  SIGNATURE_LINES,
  SHIFT_SUMMARY_TITLES as TITLES,
  TERMINAL_COLUMNS,
  creditTotalRow,
  handoverTotalRow,
  terminalTotalRow,
  fuelTotalRow,
  nozzleTotalRow,
  cashLineText,
  snapshotNote,
  summaryDetails,
} from './shiftSummaryColumns.js';

const shiftService = new CloudShiftService();

interface ShiftSummaryViewProps {
  /** The shift-summaries record; null while it loads or when it was not found. */
  shiftSummary: any | null;
  /** The read the record comes from, for the loading and Retry states. */
  query?: SectionQuery;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  canReopen: boolean;
  gracePeriodExpiresAt?: string | null;
  onReopenSuccess: () => void;
  onBack?: () => void;
  shiftStatus?: 'CLOSED' | 'LOCKED';
  onTransactionAdded?: () => void | Promise<unknown>;
  station?: any;
}

/**
 * Shift Summary (#535): the immutable snapshot taken at shift close, on the
 * Page Frame with a back link to History. Every figure comes from
 * `readShiftSummary`; stored totals are printed as stored, and a total the
 * snapshot lacks is left blank with a note under its table.
 */
export const ShiftSummaryView: React.FC<ShiftSummaryViewProps> = ({
  shiftSummary,
  query,
  userRole,
  canReopen,
  onReopenSuccess,
  onBack,
  shiftStatus,
  onTransactionAdded,
  station,
}) => {
  const confirm = useConfirm();
  const toast = useToast();
  const runTask = useRunTask();
  const timeZone: string | undefined = station?.settings?.timezone;
  const dayStartsAt: string | undefined = station?.settings?.business_day_starts_at;
  const summary = shiftSummary?.snapshotData ? readShiftSummary(shiftSummary) : null;
  const locked = (shiftStatus ?? (summary?.locked ? 'LOCKED' : 'CLOSED')) === 'LOCKED';

  const saveReopen = useKeyedSave('shifts:reopen');
  const reopen = useMutation({
    // One Idempotency-Key per logical reopen: a retry after a dropped response
    // reuses it, so the shift cannot be reopened twice.
    mutationFn: (shiftId: string) =>
      saveReopen({ stationId: station?.id, shiftId }, (idempotencyKey) =>
        shiftService.reopenShift(shiftId, { idempotencyKey }),
      ),
    // Synchronous on purpose (pump-data-caching rule 6): the caller refreshes in the background.
    onSuccess: () => {
      toast.success('Shift reopened.');
      onReopenSuccess();
    },
  });

  const handleReopen = async (shiftId: string) => {
    const ok = await confirm({
      title: 'Reopen this shift?',
      message:
        'Reopening will delete this compiled Shift Summary and set the shift state back to OPEN. It is allowed until the Business Day closes, provided no other shift is open.',
      confirmLabel: 'Reopen',
      danger: true,
    });
    if (ok) await reopen.mutateAsync(shiftId);
  };

  // Save PDF and Print render the same document, on web and desktop (#309).
  const printOrSave = async (output: 'save' | 'print') => {
    if (!summary) return;
    const { generateShiftSummaryPdf } = await import('../../services/reports/generate.js');
    await generateShiftSummaryPdf(
      station,
      shiftSummary.snapshotData,
      summary.shiftId,
      summary.template,
      { businessDate: summary.businessDate, shiftSequence: shiftSummary.shiftSequence ?? null },
      output,
    );
  };

  const subtitle = summary && (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip status={locked ? 'locked' : 'shift-closed'} size="sm" />
      <span className="font-mono">{summary.label}</span>
      <span>· {summary.template}</span>
    </span>
  );

  return (
    <PageFrame
      route={ROUTES.shifts}
      title={TITLES.page}
      subtitle={subtitle}
      back={onBack && { label: 'History', href: `#${ROUTES.shifts}`, onClick: onBack }}
      actions={
        <div className="no-print flex items-center gap-2">
          <ExportMenu
            aria-label="Export the shift summary"
            disabled={!summary}
            onPdf={() => runTask(printOrSave('save'), 'Could not create the PDF.')}
            onPrint={() => runTask(printOrSave('print'), 'Could not print the shift summary.')}
          />
          {canReopen && summary && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Unlock size={13} />}
              loading={reopen.isPending}
              onClick={() =>
                handleReopen(summary.shiftId).catch((err: unknown) =>
                  toast.error(
                    withNextStep((err as Error)?.message, 'The shift is still closed. Try again.'),
                    { title: 'Shift not reopened' },
                  ),
                )
              }
            >
              {reopen.isPending ? 'Reopening…' : 'Reopen shift'}
            </Button>
          )}
        </div>
      }
    >
      <DataSection
        title="shift summary"
        // Once the record is in hand it shows as is: a failed background
        // refetch of the list must not hide a summary already on screen.
        query={summary ? undefined : query}
        shape="cards"
        placeholderHeight={420}
        enabled
        isEmpty={!summary}
        empty={
          <EmptyState
            icon={<Icon name="report" size="md" />}
            title="Shift summary not found"
            description="This shift has no stored summary. Go back to History and pick another shift."
          />
        }
      >
        {summary && (
          <SummaryBody
            summary={summary}
            record={shiftSummary}
            timeZone={timeZone}
            dayStartsAt={dayStartsAt}
          >
            {userRole !== 'Staff' && (
              <section className="no-print flex flex-col gap-2">
                <ShiftTransactionsPanel
                  shiftId={summary.shiftId}
                  stationId={station?.id}
                  onTransactionAdded={onTransactionAdded}
                  isReadOnly={locked}
                />
              </section>
            )}
          </SummaryBody>
        )}
      </DataSection>
    </PageFrame>
  );
};

/** The report: context, warnings, then one section per table. Prints via `.print-area`. */
const SummaryBody: React.FC<{
  summary: ShiftSummary;
  record: any;
  timeZone?: string;
  dayStartsAt?: string;
  children?: React.ReactNode;
}> = ({ summary, record, timeZone, dayStartsAt, children }) => {
  const dayContext = businessDayContext(
    summary.businessDate,
    useStationBusinessDate(timeZone, dayStartsAt),
  );
  const taken = snapshotNote(summary, timeZone);
  return (
    <div className="print-area flex flex-col gap-5">
      <Panel flush>
        <dl className="m-0 grid grid-cols-2 lg:grid-cols-4">
          {summaryDetails(summary, timeZone).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5">
              <dt className="text-[12px] text-ink-muted">{label}</dt>
              <dd className="m-0 text-[13px] font-medium text-ink-strong">{value}</dd>
            </div>
          ))}
        </dl>
        {dayContext && (
          <p className="m-0 border-t border-border-soft px-4 py-2 text-[12px] text-ink-muted">
            {dayContext}
          </p>
        )}
      </Panel>
      {taken && <ReportNote>{taken}</ReportNote>}

      {summary.warnings.length > 0 && (
        <Banner severity="warning" title={TITLES.warnings}>
          {summary.warnings.length === 1 ? (
            summary.warnings[0]
          ) : (
            <ul className="m-0 mt-1 list-disc pl-5">
              {summary.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </Banner>
      )}

      <TableSection
        title={TITLES.nozzles}
        subtitle={TITLES.nozzlesSubtitle}
        columns={NOZZLE_COLUMNS}
        rows={summary.nozzles}
        totalRow={nozzleTotalRow(summary)}
        notes={volumeTotalNotes(summary.volumes)}
        emptyMessage={NOZZLES_EMPTY}
      />
      {summary.fuel.length > 0 && (
        <TableSection
          title={TITLES.fuel}
          columns={FUEL_COLUMNS}
          rows={summary.fuel}
          totalRow={fuelTotalRow(summary)}
          notes={fuelTotalNotes(summary)}
        />
      )}
      {summary.handovers.length > 0 && (
        <TableSection
          title={TITLES.handovers}
          columns={HANDOVER_COLUMNS}
          rows={summary.handovers}
          totalRow={handoverTotalRow(summary)}
        />
      )}
      {summary.terminals.length > 0 && (
        <TableSection
          title={TITLES.terminals}
          columns={TERMINAL_COLUMNS}
          rows={summary.terminals}
          totalRow={terminalTotalRow(summary)}
        />
      )}
      {summary.credit.length > 0 && (
        <TableSection
          title={TITLES.credit}
          columns={CREDIT_COLUMNS}
          rows={summary.credit}
          totalRow={creditTotalRow(summary)}
          notes={creditTotalNotes(summary)}
        />
      )}

      <section className="flex flex-col gap-2">
        <SectionHeader title={TITLES.cash} />
        <CashReconciliation lines={summary.cash} />
      </section>

      {summary.drawers.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeader title={TITLES.drawers} subtitle={TITLES.drawersSubtitle} />
          <DrawerReconciliationTable drawers={summary.drawers} showTotals />
        </section>
      )}

      <LegacyPurchasesTable snapshot={record.snapshotData} />

      {children}

      {/* Signature lines, on paper only. */}
      <div className="hidden grid-cols-2 gap-10 pt-12 text-center text-[12px] text-ink-muted print:grid">
        {SIGNATURE_LINES.map((who) => (
          <div key={who} className="flex flex-col gap-2">
            <div className="h-10 border-b border-border-strong" />
            <span>{who}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function TableSection<T extends { key: string }>({
  title,
  subtitle,
  columns,
  rows,
  totalRow,
  notes = [],
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  columns: TableColumn<T>[];
  rows: T[];
  totalRow?: TotalRow;
  notes?: string[];
  emptyMessage?: string;
}) {
  const note = rows.length > 0 ? totalNote(notes) : null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} subtitle={subtitle} />
      <Panel>
        <StatementTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          totalRow={totalRow}
          label={title}
          emptyMessage={emptyMessage}
        />
      </Panel>
      {note && <ReportNote className="max-w-none">{note}</ReportNote>}
    </section>
  );
}

/** The drawer cash as a statement: floats, plus sales, less drops, then the variances. */
const CashReconciliation: React.FC<{ lines: CashLine[] }> = ({ lines }) => (
  <Panel flush>
    <dl aria-label={TITLES.cash} className="m-0 flex flex-col">
      {lines.map((line) => (
        <div
          key={line.key}
          className={
            line.role === 'result'
              ? 'flex items-center justify-between gap-4 border-b border-border-soft bg-surface-alt px-4 py-2.5 text-[13px] font-semibold'
              : 'flex items-center justify-between gap-4 border-b border-border-soft px-4 py-2.5 text-[13px] last:border-b-0'
          }
        >
          <dt className="text-ink-default">{line.label}</dt>
          <dd className="m-0 font-mono tabular-nums text-ink-strong">
            {line.role === 'variance' ? (
              <VarianceChip amount={line.amount} size="md" />
            ) : (
              cashLineText(line)
            )}
          </dd>
        </div>
      ))}
    </dl>
  </Panel>
);
