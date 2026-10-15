import React from 'react';
import { historicalShiftMessage, type ShiftCloseCashSummaryLines } from '@pump/shared';
import { Button, Icon, VarianceChip } from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { PageFrame } from '../page-frame/index.js';
import { useKeyedSave, type KeyedSave } from '../../office-records/useKeyedSave.js';
import { ROUTES, SHIFT_CLOSE_STEPS, type ShiftCloseStep } from '../../nav-intent/routes.js';
import { formatClockInZone, formatMoney, formatShortDay } from '../../utils/format.js';
import {
  CashCountStep,
  CloseNote,
  ConfirmStep,
  HandoversStep,
  ReadingsStep,
  type CashCountStepProps,
} from './CloseShiftSteps.js';
import type { CloseDraft, CloseDrawerRow, CloseDrawerTotal } from './closeShiftModel.js';
import type { NozzleGroup, StaffAssignmentInput } from './liveShiftModel.js';

export type CloseStep = Exclude<ShiftCloseStep, 'done'>;

const STEP_LABEL: Record<CloseStep, string> = {
  readings: 'Readings',
  handovers: 'Handovers',
  cash: 'Cash count',
  confirm: 'Confirm',
};

export interface CloseShiftPageProps {
  shift: {
    id: string;
    templateName: string;
    businessDate: string;
    openedAt: string;
    openedByName?: string | null;
  };
  currentBusinessDate: string;
  timeZone?: string;
  step: CloseStep;
  onStepChange: (step: CloseStep) => void;
  /** Back to Live shift; the draft is kept. */
  onBack: () => void;

  groups: NozzleGroup[];
  readingErrors: string[];
  tanks: { id: string; name: string; productName?: string | null }[];
  drawerRows: CloseDrawerRow[];
  drawerTotal: CloseDrawerTotal;
  /** Opens the Handover drawer on top of the page; closing it returns to this step. */
  onOpenHandover: (assignment: StaffAssignmentInput) => void;

  cashLines: ShiftCloseCashSummaryLines;
  productCashOutside: CashCountStepProps['productCashOutside'];
  productCashBreakdown: CashCountStepProps['productCashBreakdown'];
  dropDrawers: CashCountStepProps['dropDrawers'];
  canRecordDrops: boolean;
  draft: CloseDraft;
  onDraftChange: (patch: Partial<CloseDraft>) => void;

  hasHandovers: boolean;
  attendantVariance: number;
  warnings: string[];
  confirmWarningsChecked: boolean;
  onConfirmWarningsChange: (checked: boolean) => void;
  isClosing: boolean;
  /** Close the shift; `save` sends it under this page's Idempotency-Key. */
  onConfirmClose: (save: KeyedSave) => void;
}

/**
 * Close shift (#534): a full page at `/shifts/<id>/close`, not a drawer. A
 * step rail (Readings → Handovers → Cash count → Confirm), the step in the
 * URL, and a sticky footer with the expected and counted office cash. A
 * missing Handover opens the Handover drawer on top of the page. The checks
 * and the API call are the old wizard's; one Idempotency-Key per page visit.
 */
export const CloseShiftPage: React.FC<CloseShiftPageProps> = (props) => {
  const {
    shift,
    currentBusinessDate,
    timeZone,
    step,
    onStepChange,
    onBack,
    draft,
    cashLines,
    drawerRows,
    warnings,
    confirmWarningsChecked,
    readingErrors,
    isClosing,
    onConfirmClose,
  } = props;
  const save = useKeyedSave(`shift:close:${shift.id}`);
  const index = SHIFT_CLOSE_STEPS.indexOf(step);
  const pendingDrawers = drawerRows.filter((r) => r.pending).length;
  const canSubmit =
    pendingDrawers === 0 &&
    readingErrors.length === 0 &&
    (warnings.length === 0 || confirmWarningsChecked);
  const historical = historicalShiftMessage(shift.businessDate, currentBusinessDate);
  const go = (i: number) => onStepChange(SHIFT_CLOSE_STEPS[i]);
  // The office count variance reads once there is a count, or on the steps that take it.
  const counted = draft.closingCash !== 0 || step === 'cash' || step === 'confirm';

  return (
    <PageFrame
      route={ROUTES.shifts}
      title={`Close ${shift.templateName}`}
      back={{ label: 'Live shift', href: `#${ROUTES.shifts}`, onClick: onBack }}
      subtitle={`Business day ${formatShortDay(shift.businessDate)} · opened ${formatClockInZone(
        shift.openedAt,
        timeZone,
      )}${shift.openedByName ? ` by ${shift.openedByName}` : ''}`}
    >
      <div className="flex flex-col gap-5">
        <ol aria-label="Close shift steps" className="flex flex-wrap items-center gap-1.5">
          {SHIFT_CLOSE_STEPS.map((s, i) => {
            const state = i < index ? 'done' : i === index ? 'active' : 'todo';
            return (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="h-px w-6 bg-border-strong" aria-hidden="true" />}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-current={state === 'active' ? 'step' : undefined}
                  onClick={() => go(i)}
                  className={cn(
                    'gap-2 rounded-chip px-3 text-[13px]',
                    state === 'active' && 'border-brand bg-surface text-ink-strong',
                    state === 'done' && 'border-border-soft bg-surface',
                    state === 'todo' && 'text-ink-muted hover:text-ink-strong',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-5 items-center justify-center rounded-full text-[12px] font-semibold',
                      state === 'active' && 'bg-brand text-on-brand',
                      state === 'done' && 'bg-success-bg text-success-fg',
                      state === 'todo' && 'border border-border-strong text-ink-muted',
                    )}
                  >
                    {state === 'done' ? <Icon name="check" size="xs" aria-hidden="true" /> : i + 1}
                  </span>
                  {STEP_LABEL[s]}
                  {state === 'done' && <span className="sr-only">(done)</span>}
                </Button>
              </li>
            );
          })}
        </ol>

        {historical && <CloseNote tone="warning">{historical}</CloseNote>}

        <div className="min-h-[320px]">
          {step === 'readings' && (
            <ReadingsStep
              groups={props.groups}
              readingErrors={readingErrors}
              tanks={props.tanks}
              draft={draft}
              onDraftChange={props.onDraftChange}
              onOpenHandover={props.onOpenHandover}
            />
          )}
          {step === 'handovers' && (
            <HandoversStep
              rows={drawerRows}
              total={props.drawerTotal}
              onOpenHandover={props.onOpenHandover}
            />
          )}
          {step === 'cash' && (
            <CashCountStep
              lines={cashLines}
              productCashOutside={props.productCashOutside}
              productCashBreakdown={props.productCashBreakdown}
              dropDrawers={props.dropDrawers}
              canRecordDrops={props.canRecordDrops}
              draft={draft}
              onDraftChange={props.onDraftChange}
            />
          )}
          {step === 'confirm' && (
            <ConfirmStep
              hasHandovers={props.hasHandovers}
              attendantVariance={props.attendantVariance}
              expectedCash={cashLines.expectedOfficeCash}
              draft={draft}
              pendingDrawers={pendingDrawers}
              warnings={warnings}
              confirmWarningsChecked={confirmWarningsChecked}
              onConfirmWarningsChange={props.onConfirmWarningsChange}
            />
          )}
        </div>

        <footer
          aria-label="Close shift"
          className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border-soft bg-surface px-4 py-3 shadow-sm"
        >
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <div className="flex items-baseline gap-2">
              <dt className="text-ink-muted">Expected office cash</dt>
              <dd className="font-mono tabular-nums text-ink-strong">
                {formatMoney(cashLines.expectedOfficeCash)}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-ink-muted">Counted</dt>
              <dd className="font-mono tabular-nums text-ink-strong">
                {formatMoney(draft.closingCash)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">Office count variance</dt>
              <dd>
                {counted ? (
                  <VarianceChip
                    amount={draft.closingCash - cashLines.expectedOfficeCash}
                    size="md"
                  />
                ) : (
                  <span className="text-[12px] text-ink-muted">Not counted yet</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12px] text-ink-muted">
              Step {index + 1} of {SHIFT_CLOSE_STEPS.length}
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="chevron-left" size="xs" />}
              onClick={index === 0 ? onBack : () => go(index - 1)}
            >
              {index === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step === 'confirm' ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="lock" size="xs" />}
                disabled={!canSubmit}
                loading={isClosing}
                onClick={() => onConfirmClose(save)}
              >
                {isClosing ? 'Closing shift…' : 'Close shift'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                rightIcon={<Icon name="chevron-right" size="xs" />}
                onClick={() => go(index + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </footer>
      </div>
    </PageFrame>
  );
};
