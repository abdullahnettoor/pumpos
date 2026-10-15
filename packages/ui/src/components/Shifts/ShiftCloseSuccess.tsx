import React from 'react';
import { formatStationDateTime, historicalShiftMessage } from '@pump/shared';
import {
  Button,
  Icon,
  InteractiveTable,
  SectionHeader,
  VarianceChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { formatMoney, formatQuantity, formatShortDay } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';
import { CloseNote } from './CloseShiftSteps.js';

export interface ShiftCloseResult {
  expectedCash: number;
  closingCash: number;
  variance: number;
  lastClosedShiftId: string;
  nextTemplateId: string;
  businessDate: string;
  currentBusinessDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  openedAt: string;
  closedAt: string;
  timeZone?: string;
}

type TankDip = {
  tankId: string;
  tankName: string;
  actualQuantity: number;
  status: 'pending' | 'saving' | 'saved' | 'failed';
  error?: string;
  expectedQuantity?: number;
  varianceQuantity?: number;
  warnings?: string[];
};

export interface ShiftCloseSuccessProps {
  result: ShiftCloseResult;
  /** The closed shift's name ("Evening"), when known. */
  shiftName?: string | null;
  onStartNext: () => void;
  onViewSummary: () => void;
  /** Back to Live shift. */
  onBack: () => void;
  tankDips?: TankDip[];
  onSaveTankDips?: () => void | Promise<unknown>;
  onDiscardTankDips?: () => void | Promise<unknown>;
}

const DIP_STATUS: Record<TankDip['status'], string> = {
  saved: 'Saved',
  saving: 'Saving…',
  failed: 'Retry required',
  pending: 'Ready',
};

const DIP_COLUMNS: TableColumn<TankDip>[] = [
  { id: 'tank', header: 'Tank', kind: 'text', value: (d) => d.tankName, emphasis: true },
  {
    id: 'dip',
    header: 'Dip',
    kind: 'qty',
    unit: 'L',
    value: (d) => d.actualQuantity,
    total: false,
  },
  {
    id: 'expected',
    header: 'Expected',
    kind: 'qty',
    unit: 'L',
    total: false,
    value: (d) => (d.status === 'saved' ? (d.expectedQuantity ?? null) : null),
    cell: (d) =>
      d.status === 'saved' && d.expectedQuantity !== undefined
        ? formatQuantity(d.expectedQuantity, 'L')
        : '—',
  },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'qty',
    unit: 'L',
    total: false,
    value: (d) => (d.status === 'saved' ? (d.varianceQuantity ?? null) : null),
    cell: (d) =>
      d.status === 'saved' && d.varianceQuantity !== undefined ? (
        <VarianceChip amount={d.varianceQuantity} kind="stock" size="md" />
      ) : (
        '—'
      ),
    text: (d) =>
      d.status === 'saved' && d.varianceQuantity !== undefined
        ? formatVariance(d.varianceQuantity, 'stock').text
        : '—',
  },
  {
    id: 'status',
    header: 'Status',
    kind: 'text',
    sortable: false,
    value: (d) => DIP_STATUS[d.status],
    cell: (d) => (
      <div className="flex flex-col gap-0.5">
        {d.status === 'failed' ? (
          <span className="text-danger-fg">Retry required</span>
        ) : (
          <span className={d.status === 'saved' ? 'text-ink-strong' : 'text-ink-muted'}>
            {DIP_STATUS[d.status]}
          </span>
        )}
        {d.error && <span className="text-[12px] text-danger-fg">{d.error}</span>}
        {d.warnings?.map((w) => (
          <span key={w} className="text-[12px] text-warning-fg">
            {w}
          </span>
        ))}
      </div>
    ),
  },
];

/**
 * Close shift → closed (#534): the Close shift page's final state. The office
 * cash outcome, any tank dips saved after close, and the next steps (open the
 * next shift, view the Shift Summary). While a tank dip still needs saving the
 * way on is held, as before, so a dip is never silently dropped.
 */
export const ShiftCloseSuccess: React.FC<ShiftCloseSuccessProps> = ({
  result,
  shiftName,
  onStartNext,
  onViewSummary,
  onBack,
  tankDips = [],
  onSaveTankDips,
  onDiscardTankDips,
}) => {
  const needsDipRetry = tankDips.some((d) => d.status === 'pending' || d.status === 'failed');
  const isSavingDips = tankDips.some((d) => d.status === 'saving');
  const held = needsDipRetry || isSavingDips;
  const name = shiftName || 'Shift';
  const historical = historicalShiftMessage(result.businessDate, result.currentBusinessDate);

  return (
    <PageFrame
      route={ROUTES.shifts}
      title={`${name} closed`}
      back={held ? undefined : { label: 'Live shift', href: `#${ROUTES.shifts}`, onClick: onBack }}
      subtitle={`Business day ${formatShortDay(result.businessDate)} · closed ${formatStationDateTime(
        result.closedAt,
        result.timeZone,
      )}`}
    >
      <div className="flex max-w-[760px] flex-col gap-5">
        {historical && <CloseNote tone="warning">{historical}</CloseNote>}
        <div className="flex items-center gap-3 rounded-card border border-border-soft bg-surface px-5 py-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-fg">
            <Icon name="check" size="md" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink-strong">
              Shift closed. Its Shift Summary is saved and locked.
            </div>
            <div className="text-[13px] text-ink-muted">
              The business day stays open; close it from Business days.
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-label="Office cash">
          <SectionHeader title="Office cash" />
          <dl className="flex flex-col gap-1.5 rounded-card border border-border-soft bg-surface px-4 py-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt>Expected office cash</dt>
              <dd className="font-mono tabular-nums">{formatMoney(result.expectedCash)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Counted</dt>
              <dd className="font-mono tabular-nums">{formatMoney(result.closingCash)}</dd>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-soft pt-2 font-semibold text-ink-strong">
              <dt>Office count variance</dt>
              <dd>
                <VarianceChip amount={result.variance} size="md" />
              </dd>
            </div>
          </dl>
        </section>

        {tankDips.length > 0 && (
          <section className="flex flex-col gap-2" aria-label="Tank dips">
            <SectionHeader title="Tank dips" subtitle="Recorded after the fuel sales were posted" />
            <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
              <InteractiveTable
                bare
                dense
                columns={DIP_COLUMNS}
                rows={tankDips}
                rowKey={(d) => d.tankId}
              />
            </div>
            {needsDipRetry && onSaveTankDips && (
              <CloseNote tone="warning">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Some tank dips could not be recorded automatically.</span>
                  <span className="flex gap-2">
                    {onDiscardTankDips && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={onDiscardTankDips}
                        disabled={isSavingDips}
                      >
                        Discard unsaved dips
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={onSaveTankDips}
                      loading={isSavingDips}
                    >
                      Retry tank dips
                    </Button>
                  </span>
                </div>
              </CloseNote>
            )}
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            leftIcon={<Icon name="play" size="sm" />}
            onClick={onStartNext}
            disabled={held}
          >
            Open next shift
          </Button>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<Icon name="file-text" size="sm" />}
            onClick={onViewSummary}
            disabled={held}
          >
            View shift summary
          </Button>
        </div>
      </div>
    </PageFrame>
  );
};
