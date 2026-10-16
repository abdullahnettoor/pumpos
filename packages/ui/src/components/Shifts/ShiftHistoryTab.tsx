import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { can, principalOf } from '@pump/shared';
import {
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  SectionHeader,
  VarianceChip,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { historyTotalLabel, newestFirst } from './shiftHistoryModel.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { formatDate } from '../../utils/format.js';
import { countOf } from '../../utils/ledgerWindow.js';
import { formatStationDateTime, shiftDisplayLabel } from '@pump/shared';
import { useShiftSummaries } from '../../query/hooks.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';
import { useRunTask } from '../../utils/runTask.js';

/** A row of `GET /shift-summaries`, the fields this list reads. */
interface SummaryRow {
  id?: string;
  shiftId: string;
  status?: string | null;
  businessDate?: string | null;
  shiftSequence?: number | null;
  generatedAt?: string | null;
  templateName?: string | null;
  snapshotData?: {
    templateName?: string | null;
    shiftStatus?: string | null;
    closedByName?: string | null;
    expectedCash?: number | string | null;
    closingCash?: number | string | null;
    cashVariance?: number | string | null;
  } | null;
}

interface ShiftHistoryTabProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  viewShiftId?: string | null;
  onClearViewShiftId?: () => void;
  /**
   * Open a row's summary by id. When given, the parent owns the open summary
   * (and renders this tab outside its Page Frame, so the summary is a page of
   * its own); else the tab keeps it locally.
   */
  onOpenShift?: (shiftId: string) => void;
}

/**
 * History (#533): the closed and locked shifts, newest first, on the Table
 * module in its own Data Section (Retry on failure). A row opens the full
 * ShiftSummaryView. Read through the cached useShiftSummaries hook (refreshes
 * via operational invalidation).
 */
export const ShiftHistoryTab: React.FC<ShiftHistoryTabProps> = ({
  selectedStation,
  userRole,
  viewShiftId,
  onClearViewShiftId,
  onOpenShift,
}) => {
  const stationId = selectedStation?.id ?? null;
  const timeZone = (selectedStation?.settings as { timezone?: string } | undefined)?.timezone;
  const summariesQ = useShiftSummaries(stationId);
  const runTask = useRunTask();
  const summaries = useMemo(() => summariesQ.data ?? [], [summariesQ.data]);
  const [pickedSummary, setPickedSummary] = useState<any | null>(null);

  // A shift requested by id (deep link from the shifts workspace) is derived
  // rather than copied into state by an effect. The old version waited for
  // `summaries` to arrive and re-ran when it did; deriving simply resolves once
  // the list lands, and a row the operator picks takes precedence.
  const activeSummary =
    pickedSummary ??
    (viewShiftId ? (summaries.find((d: any) => d.shiftId === viewShiftId) ?? null) : null);

  // Stable so the column definitions below keep memoising.
  const setActiveSummary = useCallback(
    (row: any) => {
      if (onOpenShift) {
        onOpenShift(row.shiftId);
        return;
      }
      onClearViewShiftId?.();
      setPickedSummary(row);
    },
    [onClearViewShiftId, onOpenShift],
  );

  const handleBack = () => {
    setPickedSummary(null);
    onClearViewShiftId?.();
  };

  const rows = useMemo<SummaryRow[]>(() => newestFirst<SummaryRow>(summaries), [summaries]);
  // A money table has a total row; it says how many shifts it covers.
  const totalRow = useMemo<TotalRow>(
    () => ({ label: historyTotalLabel(rows.length) }),
    [rows.length],
  );

  const columns = useMemo<TableColumn<SummaryRow>[]>(
    () => [
      // Business Day leads, and it is the primary read (#226). A shift closing
      // 05:11 on the 17th belongs to the 16th; leading with the closure
      // timestamp invited reading that row as the 17th's.
      {
        id: 'businessDate',
        header: 'Business day',
        kind: 'date',
        value: (r) => r.businessDate,
        cell: (r) =>
          r.businessDate ? (
            <span className="font-semibold text-ink-strong">{formatDate(r.businessDate)}</span>
          ) : (
            '—'
          ),
      },
      // The shift's readable name (#228) — `YYYYMMDD-N`, the same string the
      // shift-summary PDF and the attendant statement print.
      {
        id: 'shiftLabel',
        header: 'Shift',
        kind: 'text',
        value: (r) => shiftDisplayLabel(r),
        cell: (r) => <span className="font-mono">{shiftDisplayLabel(r)}</span>,
      },
      {
        id: 'template',
        header: 'Template',
        kind: 'text',
        // The list endpoint joins the template and returns its live name
        // top-level. The snapshot copy is the fallback, not the source:
        // reading it first made every row say "Custom".
        value: (r) => r.templateName || r.snapshotData?.templateName || 'Custom',
      },
      {
        id: 'status',
        header: 'Status',
        kind: 'status',
        // The endpoint returns `status`. Reading `shiftStatus` matched
        // nothing, so a Locked shift rendered as merely Closed.
        value: (r) =>
          (r.status || r.snapshotData?.shiftStatus || 'CLOSED') === 'LOCKED'
            ? 'locked'
            : 'shift-closed',
      },
      // Demoted, not dropped: still the answer to "when was this reconciled?".
      {
        id: 'generatedAt',
        header: 'Closed at',
        kind: 'text',
        value: (r) => formatStationDateTime(r.generatedAt, timeZone),
      },
      {
        id: 'closedBy',
        header: 'Reconciled by',
        kind: 'text',
        value: (r) => r.snapshotData?.closedByName || 'Unknown',
      },
      {
        id: 'expected',
        header: 'Expected',
        kind: 'money',
        value: (r) => Number(r.snapshotData?.expectedCash || 0),
      },
      {
        id: 'actual',
        header: 'Counted',
        kind: 'money',
        value: (r) => Number(r.snapshotData?.closingCash || 0),
      },
      {
        id: 'variance',
        header: 'Variance',
        kind: 'money',
        value: (r) => Number(r.snapshotData?.cashVariance || 0),
        cell: (r) => <VarianceChip amount={r.snapshotData?.cashVariance || 0} size="md" />,
      },
    ],
    [timeZone],
  );

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">
        Please select a station to view shift history.
      </p>
    );
  }

  if (activeSummary || viewShiftId) {
    const canReopen =
      can(principalOf(userRole), 'shifts.reopen') &&
      (activeSummary?.shiftStatus ?? activeSummary?.status) === 'CLOSED';

    return (
      <div>
        <ShiftSummaryView
          shiftSummary={activeSummary}
          query={summariesQ}
          userRole={userRole}
          canReopen={canReopen}
          shiftStatus={activeSummary?.shiftStatus ?? activeSummary?.status}
          station={selectedStation}
          onReopenSuccess={() => {
            runTask(
              summariesQ.refetch(),
              'Shift reopened, but the history could not be refreshed.',
            );
            handleBack();
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Closed shifts">
      <SectionHeader
        title="Closed shifts"
        subtitle={summariesQ.data ? countOf(rows.length, 'shift', 'shifts') : undefined}
        controls={{
          info: (
            <InfoTip label="About shift history" placement="bottom">
              Every closed and locked shift, newest first, with the Shift Summary taken at close.
              Variance is the office count against the expected drawer cash. Open a row for the full
              summary.
            </InfoTip>
          ),
        }}
      />
      <DataSection
        title="shift history"
        query={summariesQ}
        placeholderHeight={240}
        flush
        isEmpty={rows.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="clock" size="md" />}
              title="No closed shifts yet"
              description="Close an active shift to generate its first Shift Summary."
            />
          </div>
        }
      >
        <InteractiveTable
          bare
          columns={columns}
          rows={rows}
          totalRow={totalRow}
          rowKey={(d) => d.id ?? d.shiftId}
          onRowClick={(row) => setActiveSummary(row)}
          rowLabel={(r) => `Shift ${shiftDisplayLabel(r)}`}
          title="shift history"
        />
      </DataSection>
    </section>
  );
};
