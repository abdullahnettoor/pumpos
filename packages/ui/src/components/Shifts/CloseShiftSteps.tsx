import React, { useEffect, useRef, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useZodForm } from '../../forms/useZodForm.js';
import { drawerKey, type ShiftCloseCashSummaryLines } from '@pump/shared';
import {
  Button,
  Icon,
  Input,
  InteractiveTable,
  SectionHeader,
  Select,
  StatusChip,
  VarianceChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { Checkbox } from '../primitives/Toggle.js';
import { CashCountPopover } from '../primitives/CashCountPopover.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { formatMoney, MINUS } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';
import { NozzleReadingsTable } from './NozzleReadingsTable.js';
import { drawerColumns, drawerTotalRow } from './DrawerReconciliationTable.js';
import type { HandoverWrites } from './handoverWrites.js';
import {
  cashCountDefaults,
  cashCountSchema,
  cashCountToDraft,
  denominationCountError,
  dipCount,
  type CashCountFormValues,
  type CloseDraft,
  type CloseDrawerRow,
  type CloseDrawerTotal,
} from './closeShiftModel.js';
import type { NozzleGroup, StaffAssignmentInput } from './liveShiftModel.js';

/**
 * The four steps of the Close shift page (#534): Readings (with the optional
 * tank dips), Handovers, Cash count and Confirm (with the review the old
 * wizard asked for). Layout only: every figure arrives worked out.
 */

type DraftPatch = (patch: Partial<CloseDraft>) => void;

/** A one-line note under a section. Red and amber only for a problem. */
export const CloseNote: React.FC<{
  tone: 'danger' | 'warning' | 'neutral';
  role?: 'alert';
  children: React.ReactNode;
}> = ({ tone, role, children }) => (
  <div
    role={role}
    className={cn(
      'flex items-start gap-2 rounded-input border px-3 py-2 text-[13px]',
      tone === 'danger' && 'border-transparent bg-danger-bg text-danger-fg',
      tone === 'warning' && 'border-transparent bg-warning-bg text-warning-fg',
      tone === 'neutral' && 'border-border-soft bg-surface-alt text-ink-muted',
    )}
  >
    <Icon
      name={tone === 'neutral' ? 'info' : tone === 'warning' ? 'alert-triangle' : 'alert-circle'}
      size="sm"
      aria-hidden="true"
      className="mt-px shrink-0"
    />
    <div className="min-w-0">{children}</div>
  </div>
);

/** A labelled figure line in a summary card. */
const Line: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  total?: boolean;
  sub?: boolean;
}> = ({ label, value, total, sub }) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3',
      total && 'mt-1 border-t border-border-soft pt-2 font-semibold text-ink-strong',
      sub ? 'pl-4 text-[12px] text-ink-muted' : 'text-[13px]',
    )}
  >
    <dt>{label}</dt>
    <dd
      className={
        typeof value === 'string' || typeof value === 'number'
          ? 'font-mono tabular-nums'
          : undefined
      }
    >
      {value}
    </dd>
  </div>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <dl
    className={cn(
      'flex flex-col gap-1.5 rounded-card border border-border-soft bg-surface px-4 py-3',
      className,
    )}
  >
    {children}
  </dl>
);

const signed = (v: number, sign: '+' | '−') => `${sign === '+' ? '+' : MINUS}${formatMoney(v)}`;

// ── 1. Readings ─────────────────────────────────────────────────────────────

export interface ReadingsStepProps {
  groups: NozzleGroup[];
  readingErrors: string[];
  tanks: { id: string; name: string; productName?: string | null }[];
  draft: CloseDraft;
  onDraftChange: DraftPatch;
  onOpenHandover: (assignment: StaffAssignmentInput) => void;
}

export const ReadingsStep: React.FC<ReadingsStepProps> = ({
  groups,
  readingErrors,
  tanks,
  draft,
  onDraftChange,
  onOpenHandover,
}) => {
  const confirm = useConfirm();
  const pending = groups.filter((g) => g.assignment && !g.handover);
  const toggleDips = async (next: boolean) => {
    if (!next && dipCount(draft) > 0) {
      const ok = await confirm({
        title: 'Close without recording tank dips?',
        message:
          'The entered tank dip values will be discarded. The shift can still be closed without recording a dip.',
        confirmLabel: 'Discard tank dips',
        danger: true,
      });
      if (!ok) return;
      onDraftChange({ recordDip: false, dipReadings: {}, dipReasons: {} });
      return;
    }
    onDraftChange({ recordDip: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <NozzleReadingsTable groups={groups} onOpenHandover={onOpenHandover} />
        {readingErrors.length > 0 ? (
          <CloseNote tone="danger" role="alert">
            {readingErrors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </CloseNote>
        ) : pending.length > 0 ? (
          <CloseNote tone="neutral">
            {pending.map((g) => g.du).join(', ')} readings come in with{' '}
            {pending.length === 1 ? 'its handover' : 'their handovers'} (next step).
          </CloseNote>
        ) : (
          <CloseNote tone="neutral">Every closing reading is at or above its opening.</CloseNote>
        )}
      </div>

      <section className="flex flex-col gap-2" aria-label="Tank dips">
        <SectionHeader title="Tank dips" subtitle="Optional" />
        <p className="text-[12px] text-ink-muted">
          Enter the stock measured with a dip-stick if you took one. Otherwise the expected stock is
          used.
        </p>
        <Checkbox
          label="I recorded physical dip readings this shift"
          checked={draft.recordDip}
          onChange={(e) => toggleDips(e.target.checked)}
        />
        {draft.recordDip && tanks.length === 0 && (
          <p className="text-[12px] text-ink-muted">No tanks configured for this station.</p>
        )}
        {draft.recordDip && tanks.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-card border border-border-soft bg-surface">
            {tanks.map((tank) => (
              <li
                key={tank.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink-strong">{tank.name}</div>
                  <div className="text-[12px] text-ink-muted">
                    {tank.productName} · reconciled after the shift closes
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    inputSize="sm"
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="Actual"
                    aria-label={`${tank.name} dip, litres`}
                    className="w-28 text-right font-mono"
                    value={draft.dipReadings[tank.id] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onDraftChange({
                        dipReadings: {
                          ...draft.dipReadings,
                          [tank.id]: val === '' ? '' : Number(val),
                        },
                      });
                    }}
                  />
                  <span className="text-[12px] text-ink-muted">L</span>
                  <Input
                    inputSize="sm"
                    maxLength={255}
                    placeholder="Reason (optional)"
                    aria-label={`${tank.name} dip reason`}
                    className="w-48"
                    value={draft.dipReasons[tank.id] ?? ''}
                    onChange={(e) =>
                      onDraftChange({
                        dipReasons: { ...draft.dipReasons, [tank.id]: e.target.value },
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

// ── 2. Handovers ────────────────────────────────────────────────────────────

export interface HandoversStepProps {
  rows: CloseDrawerRow[];
  total: CloseDrawerTotal;
  onOpenHandover: (assignment: StaffAssignmentInput) => void;
  /** Handovers still saving or failed, by Drawer key (#606). */
  writes?: HandoverWrites;
}

/** "1 drawer has not handed over. Hand over every drawer before closing." */
export const PendingDrawersNote: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <CloseNote tone="danger" role="alert">
      {count === 1 ? '1 drawer has not handed over.' : `${count} drawers have not handed over.`}{' '}
      Hand over every drawer before closing.
    </CloseNote>
  ) : null;

export const HandoversStep: React.FC<HandoversStepProps> = ({
  rows,
  total,
  onOpenHandover,
  writes,
}) => {
  const pending = rows.filter((r) => r.pending).length;
  const columns = React.useMemo(
    () => drawerColumns(onOpenHandover, writes),
    [onOpenHandover, writes],
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2" aria-label="Drawers">
        <SectionHeader title="Drawers" subtitle="Expected = float + cash sales − drops" />
        <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
          <InteractiveTable
            bare
            dense
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            emptyMessage="No attendant drawers on this shift."
            totalRow={drawerTotalRow(rows, total)}
          />
        </div>
      </section>
      {pending > 0 ? (
        <PendingDrawersNote count={pending} />
      ) : rows.length > 0 ? (
        <CloseNote tone="neutral">
          {rows.length === 1 ? 'The drawer has' : `All ${rows.length} drawers have`} handed over.
          Attendant shortages are not posted to the ledger.
        </CloseNote>
      ) : null}
    </div>
  );
};

// ── 3. Cash count ───────────────────────────────────────────────────────────

export interface CashCountStepProps {
  lines: ShiftCloseCashSummaryLines;
  /** Product sales cash collected outside any Drawer's Handover. */
  productCashOutside: number;
  productCashBreakdown: { sellerName: string; amount: number }[];
  /** The Drawers a drop at close may name. */
  dropDrawers: { attendantId: string; duId?: string; label: string }[];
  /** Drops at close can be recorded (the server reconciliation is loaded). */
  canRecordDrops: boolean;
  draft: CloseDraft;
  onDraftChange: DraftPatch;
  /** Whether the count and drops as typed are valid (the page holds Next until they are). */
  onValidityChange?: (valid: boolean) => void;
}

export const CashCountStep: React.FC<CashCountStepProps> = ({
  lines,
  productCashOutside,
  productCashBreakdown,
  dropDrawers,
  canRecordDrops,
  draft,
  onDraftChange,
  onValidityChange,
}) => {
  const [showWhy, setShowWhy] = useState(false);
  const variance = draft.closingCash - lines.expectedOfficeCash;
  const office = formatVariance(variance, 'cash');
  // React Hook Form + Zod: the count and the drops as typed. Only values the
  // schema accepts reach the draft, so a negative amount never reaches
  // Confirm or the API.
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm<CashCountFormValues>(cashCountSchema, {
    mode: 'onChange',
    defaultValues: cashCountDefaults(draft),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'closeDrops' });
  const toDraft = useRef({ onDraftChange, onValidityChange });
  useEffect(() => {
    toDraft.current = { onDraftChange, onValidityChange };
  });
  useEffect(() => {
    const sub = watch((values) => {
      const parsed = cashCountSchema.safeParse(values);
      toDraft.current.onValidityChange?.(parsed.success);
      if (parsed.success) toDraft.current.onDraftChange(cashCountToDraft(parsed.data));
    });
    return () => {
      sub.unsubscribe();
      toDraft.current.onValidityChange?.(true);
    };
  }, [watch]);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-label="Expected office cash">
        <SectionHeader title="Expected office cash" />
        <Card>
          <Line label="Opening floats" value={formatMoney(lines.openingFloats)} />
          <Line label="Cash declared" value={signed(lines.cashDeclared, '+')} />
          {productCashOutside > 0 && (
            <Line
              sub
              label="incl. product sales cash not on a drawer"
              value={formatMoney(productCashOutside)}
            />
          )}
          {productCashBreakdown.map((b) => (
            <Line key={b.sellerName} sub label={b.sellerName} value={formatMoney(b.amount)} />
          ))}
          {lines.handoverDrops > 0 && (
            <Line label="Handover drops" value={signed(lines.handoverDrops, '−')} />
          )}
          {lines.unassignedCloseDrops > 0 && (
            <Line label="Office drops at close" value={signed(lines.unassignedCloseDrops, '−')} />
          )}
          <Line total label="Expected office cash" value={formatMoney(lines.expectedOfficeCash)} />
        </Card>
      </section>

      {canRecordDrops && (
        <section className="flex flex-col gap-2" aria-labelledby="close-drops-heading">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="close-drops-heading"
              className="px-0.5 text-[12px] font-semibold uppercase tracking-wide text-ink-muted"
            >
              Drops at close
            </h2>
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() =>
                append({ drawerKey: dropDrawers[0] ? drawerKey(dropDrawers[0]) : '', amount: '' })
              }
            >
              Add drop
            </Button>
          </div>
          {fields.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              Cash the office takes from a drawer now. A drop naming no drawer lowers the expected
              office cash.
            </p>
          ) : (
            fields.map((field, i) => {
              const amountError = errors.closeDrops?.[i]?.amount?.message;
              return (
                <div
                  key={field.id}
                  role="group"
                  aria-labelledby="close-drops-heading"
                  className="flex flex-col gap-0.5"
                >
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Drop from drawer"
                      className="flex-[1.4]"
                      {...register(`closeDrops.${i}.drawerKey`)}
                    >
                      {dropDrawers.map((d) => (
                        <option key={drawerKey(d)} value={drawerKey(d)}>
                          {d.label}
                        </option>
                      ))}
                      <option value="">No drawer (office)</option>
                    </Select>
                    <Input
                      aria-label="Drop amount"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="Amount"
                      invalid={!!amountError}
                      className="flex-1 text-right font-mono"
                      {...register(`closeDrops.${i}.amount`)}
                    />
                    <Button
                      variant="ghost"
                      size="md"
                      iconOnly
                      aria-label="Remove drop"
                      leftIcon={<Icon name="x" size="sm" />}
                      onClick={() => remove(i)}
                    />
                  </div>
                  {amountError && (
                    <span className="text-right text-[12px] text-danger-fg">{amountError}</span>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label="Office cash count">
        <SectionHeader title="Counted office cash" subtitle="Float + deposited" />
        <div className="flex items-center gap-2">
          <Input
            aria-label="Counted office cash (float + deposited)"
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="0"
            autoFocus
            invalid={!!errors.closingCash}
            className="flex-1 text-right font-mono"
            {...register('closingCash')}
          />
          <CashCountPopover
            breakdown={draft.cashBreakdown}
            onBreakdownChange={(cashBreakdown) => onDraftChange({ cashBreakdown })}
            onApply={(t) => setValue('closingCash', String(t), { shouldValidate: true })}
            currentValue={draft.closingCash}
            title="Count safe cash by denomination"
            validateCount={denominationCountError}
          />
        </div>
        {errors.closingCash?.message && (
          <span className="text-[12px] text-danger-fg" role="alert">
            {errors.closingCash.message}
          </span>
        )}
        <div
          className="flex items-center justify-between gap-3 rounded-card border border-border-soft bg-surface px-4 py-2.5 text-[13px]"
          data-testid="office-count-variance"
          data-state={office.state}
        >
          <span className="font-medium text-ink-strong">Office count variance</span>
          <VarianceChip amount={variance} size="md" />
        </div>
        {office.state !== 'balanced' && (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="-ml-2.5 self-start text-brand"
              aria-expanded={showWhy}
              onClick={() => setShowWhy((v) => !v)}
            >
              {showWhy ? 'Hide' : 'Why might this happen?'}
            </Button>
            {showWhy && (
              <ul className="ml-5 flex list-disc flex-col gap-1 text-[12px] text-ink-muted">
                {variance < 0 ? (
                  <>
                    <li>
                      Cash taken from the drawer for the office (expenses, supplier payments) not
                      yet recorded as a cash drop.
                    </li>
                    <li>
                      Cash was miscounted or went missing after the attendants handed over.
                      Attendant shortages are shown separately in Handovers.
                    </li>
                  </>
                ) : (
                  <>
                    <li>A cash drop was recorded that did not leave the drawer.</li>
                    <li>
                      Counted safe cash includes the next-shift float that hasn&apos;t been removed
                      yet.
                    </li>
                    <li>
                      Cash receipt against a credit chit recorded as Credit instead of Cash: verify
                      the latest collections.
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>
        )}
        <p className="text-[12px] text-ink-muted">
          Cash moved after close is not a drop: record it as an office transfer (Cash in Hand → Safe
          or Bank) on its entry date.
        </p>
      </section>
    </div>
  );
};

// ── 4. Confirm ──────────────────────────────────────────────────────────────

export interface ConfirmStepProps {
  hasHandovers: boolean;
  attendantVariance: number;
  expectedCash: number;
  draft: CloseDraft;
  pendingDrawers: number;
  warnings: string[];
  confirmWarningsChecked: boolean;
  onConfirmWarningsChange: (checked: boolean) => void;
}

export const ConfirmStep: React.FC<ConfirmStepProps> = ({
  hasHandovers,
  attendantVariance,
  expectedCash,
  draft,
  pendingDrawers,
  warnings,
  confirmWarningsChecked,
  onConfirmWarningsChange,
}) => (
  <div className="flex flex-col gap-5">
    <section className="flex flex-col gap-2" aria-label="Shift summary">
      <SectionHeader title="Shift summary" />
      <Card>
        {hasHandovers && (
          <Line
            label="Attendant variance (handovers)"
            value={<VarianceChip amount={attendantVariance} size="md" />}
          />
        )}
        <Line label="Expected office cash" value={formatMoney(expectedCash)} />
        <Line label="Counted office cash" value={formatMoney(draft.closingCash)} />
        <Line
          total
          label="Office count variance"
          value={<VarianceChip amount={draft.closingCash - expectedCash} size="md" />}
        />
        <Line label="Tank dips captured" value={dipCount(draft)} />
        <Line
          label="Warnings acknowledged"
          value={
            warnings.length === 0 ? (
              <span className="font-sans text-ink-muted">None</span>
            ) : confirmWarningsChecked ? (
              <span className="font-sans text-ink-strong">Yes</span>
            ) : (
              <StatusChip status="pending" size="md" pulse={false} />
            )
          }
        />
      </Card>
    </section>

    <section className="flex flex-col gap-2" aria-label="Review before closing">
      <SectionHeader
        title="Review before closing"
        subtitle={warnings.length ? `${warnings.length} to acknowledge` : undefined}
      />
      <PendingDrawersNote count={pendingDrawers} />
      {warnings.length === 0 ? (
        <CloseNote tone="neutral">No warnings. Safe to proceed.</CloseNote>
      ) : (
        <>
          <CloseNote tone="warning">
            <ul className="ml-4 flex list-disc flex-col gap-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CloseNote>
          <Checkbox
            label="I confirm these readings are correct and wish to proceed anyway."
            checked={confirmWarningsChecked}
            onChange={(e) => onConfirmWarningsChange(e.target.checked)}
          />
        </>
      )}
    </section>

    <p className="text-[12px] text-ink-muted">
      Closing moves the shift to Closed and saves its Shift Summary as a locked snapshot. The
      business day stays open until it is closed.
    </p>
  </div>
);
