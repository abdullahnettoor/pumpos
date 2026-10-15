import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatStationDateTime } from '@pump/shared';
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
import { useToast } from '../primitives/ToastProvider.js';
import { ReportNote } from '../reports/ReportNote.js';
import { formatBusinessDate, formatMoney } from '../../utils/format.js';
import { useRunTask } from '../../utils/runTask.js';
import { ShiftTransactionsPanel } from './ShiftTransactionsPanel.js';
import { LegacyPurchasesTable } from './LegacyPurchasesTable.js';
import { DrawerReconciliationTable } from './DrawerReconciliationTable.js';
import {
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
  SHIFT_SUMMARY_TITLES as TITLES,
  TERMINAL_COLUMNS,
  creditTotalRow,
  fuelTotalRow,
  nozzleTotalRow,
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
  const summary = shiftSummary?.snapshotData ? readShiftSummary(shiftSummary) : null;
  const locked = (shiftStatus ?? (summary?.locked ? 'LOCKED' : 'CLOSED')) === 'LOCKED';

  const reopen = useMutation({
    mutationFn: (shiftId: string) => shiftService.reopenShift(shiftId),
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
      title="Shift summary"
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
                  toast.error((err as Error)?.message || 'Failed to reopen shift'),
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
          <SummaryBody summary={summary} record={shiftSummary} timeZone={timeZone}>
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
  children?: React.ReactNode;
}> = ({ summary, record, timeZone, children }) => {
  const at = (iso: string | null) => (iso ? formatStationDateTime(iso, timeZone) : '—');
  return (
    <div className="print-area flex flex-col gap-5">
      <Panel flush>
        <dl className="m-0 grid grid-cols-2 lg:grid-cols-4">
          {[
            ['Business day', summary.businessDate ? formatBusinessDate(summary.businessDate) : '—'],
            ['Opened', at(summary.openedAt)],
            ['Closed', at(summary.closedAt)],
            ['Reconciled by', summary.closedBy],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5">
              <dt className="text-[12px] text-ink-muted">{label}</dt>
              <dd className="m-0 text-[13px] font-medium text-ink-strong">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      {summary.generatedAt && (
        <ReportNote>
          Snapshot taken at close, {at(summary.generatedAt)}. Its figures never change.
        </ReportNote>
      )}

      {summary.warnings.length > 0 && (
        <Banner severity="warning" title="Warnings at close">
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
        emptyMessage="No nozzle readings in this summary."
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
          totalRow
        />
      )}
      {summary.terminals.length > 0 && (
        <TableSection
          title={TITLES.terminals}
          columns={TERMINAL_COLUMNS}
          rows={summary.terminals}
          totalRow
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
          <DrawerReconciliationTable drawers={summary.drawers} />
        </section>
      )}

      <LegacyPurchasesTable snapshot={record.snapshotData} />

      {children}

      {/* Signature lines, on paper only. */}
      <div className="hidden grid-cols-2 gap-10 pt-12 text-center text-[12px] text-ink-muted print:grid">
        {[
          'Operator / reconciliation staff signature',
          'Owner / manager verification signature',
        ].map((who) => (
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

const SIGN: Record<CashLine['role'], string> = {
  base: '',
  plus: '+ ',
  minus: '− ',
  result: '',
  variance: '',
};

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
              `${SIGN[line.role]}${formatMoney(line.amount)}`
            )}
          </dd>
        </div>
      ))}
    </dl>
  </Panel>
);
