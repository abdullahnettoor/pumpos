import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { Panel, Button, StatusChip, DateText } from '../../pump-ds/index.js';
import { DataTable } from '../primitives/DataTable.js';
import { inr } from '../../utils/format.js';
import { useShiftSummaries } from '../../query/hooks.js';
import { ShiftSummaryView } from './ShiftSummaryView.js';

interface ShiftHistoryTabProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  viewShiftId?: string | null;
  onClearViewShiftId?: () => void;
}

/**
 * History sub-tab: a pump-ds DataTable of closed/locked shift-summary snapshots.
 * Selecting a row opens the full ShiftSummaryView (print document). Data is read
 * through the cached useShiftSummaries hook (refreshes via operational invalidation).
 */
export const ShiftHistoryTab: React.FC<ShiftHistoryTabProps> = ({
  selectedStation,
  userRole,
  viewShiftId,
  onClearViewShiftId,
}) => {
  const stationId = selectedStation?.id ?? null;
  const summariesQ = useShiftSummaries(stationId);
  const summaries = summariesQ.data ?? [];
  const [activeSummary, setActiveSummary] = useState<any | null>(null);

  useEffect(() => {
    if (viewShiftId && summaries.length > 0) {
      const match = summaries.find((d: any) => d.shiftId === viewShiftId);
      if (match) setActiveSummary(match);
    }
  }, [viewShiftId, summaries]);

  const handleBack = () => {
    setActiveSummary(null);
    onClearViewShiftId?.();
  };

  const columns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: 'generatedAt',
        header: 'Closure Date',
        cell: ({ row }) => <DateText value={row.original.generatedAt} variant="datetime" />,
      },
      {
        id: 'businessDate',
        header: 'Business Day',
        cell: ({ row }) =>
          row.original.businessDate ? (
            <DateText value={row.original.businessDate} />
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>—</span>
          ),
      },
      {
        id: 'template',
        header: 'Template',
        cell: ({ row }) => (
          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
            {row.original.snapshotData?.templateName || 'Custom'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.shiftStatus || row.original.snapshotData?.shiftStatus || 'CLOSED';
          return <StatusChip status={s === 'LOCKED' ? 'locked' : 'closed'} size="sm" />;
        },
      },
      {
        id: 'closedBy',
        header: 'Reconciled By',
        cell: ({ row }) => (
          <span style={{ color: 'var(--text-default)' }}>{row.original.snapshotData?.closedByName || 'Unknown'}</span>
        ),
      },
      {
        id: 'expected',
        header: 'Expected',
        cell: ({ row }) => (
          <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(row.original.snapshotData?.expectedCash || 0)}</span>
        ),
      },
      {
        id: 'actual',
        header: 'Actual',
        cell: ({ row }) => (
          <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(row.original.snapshotData?.closingCash || 0)}</span>
        ),
      },
      {
        id: 'variance',
        header: 'Variance',
        cell: ({ row }) => {
          const v = Number(row.original.snapshotData?.cashVariance || 0);
          const color = v < 0 ? 'var(--brand-danger)' : v > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
          return (
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
              {v > 0 ? '+' : ''}
              {inr(v)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="secondary" size="xs" leftIcon={<Eye size={12} />} onClick={() => setActiveSummary(row.original)}>
            View
          </Button>
        ),
      },
    ],
    [],
  );

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view shift history.
      </div>
    );
  }

  if (activeSummary) {
    const canReopen =
      (userRole === 'Owner' || userRole === 'Manager') && activeSummary.shiftStatus === 'CLOSED';

    return (
      <div className="animate-fade-in">
        <ShiftSummaryView
          shiftSummary={activeSummary}
          userRole={userRole}
          canReopen={canReopen}
          shiftStatus={activeSummary.shiftStatus}
          station={selectedStation}
          onReopenSuccess={() => {
            summariesQ.refetch();
            handleBack();
          }}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Panel flush title="Closed & locked shifts">
        <DataTable
          columns={columns}
          data={summaries}
          isLoading={summariesQ.isLoading}
          error={summariesQ.error as Error | null}
          bare
          getRowId={(d: any) => d.id}
          emptyMessage="No closed shifts yet. Close an active shift to generate your first summary."
          initialSorting={[{ id: 'generatedAt', desc: true }]}
        />
      </Panel>
    </div>
  );
};
