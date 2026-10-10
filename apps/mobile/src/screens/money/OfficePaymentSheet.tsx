import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import {
  accountTypeLabel,
  filterFundingAccounts,
  inr,
  reconcileFundingSelection,
  useFundingAccounts,
  useToast,
  type FundingAccountType,
} from '@pump/ui';
import { entryDateToday, type OfficePaymentFields } from '../../lib/money/officePayment.js';
import { inputClass } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/BottomSheet.js';
import { SegmentedControl } from '../../ui/SegmentedControl.js';
import type { OfficePaymentResult } from './useOfficePayment.js';

const FIELD_TEXT = '!font-sans !text-[15px] !font-medium';

/** A method a sheet offers, when the record has one (a Collection does; a Supplier Payment does not). */
export interface PaymentMethodOption {
  value: string;
  label: string;
}

export interface OfficePaymentSheetProps<F extends OfficePaymentFields> {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  title: string;
  /** Who it is with: shown under the title and in the success toast. */
  partyName: string;
  stationId: string;
  /** Station IANA timezone: the Entry Date defaults to today there. */
  timeZone?: string | null;
  /** The resolver schema; `today` is the station's Entry Date today. */
  schemaFor: (today: string) => ZodTypeAny;
  defaultValues: (today: string) => F;
  /** Present for a Collection: the method picker; `accountTypes` says which accounts suit each. */
  methods?: readonly PaymentMethodOption[];
  /** Which Funding Account types may take this payment. A stable reference (module level). */
  accountTypes: (method: string | undefined) => readonly FundingAccountType[];
  amountLabel: string;
  accountLabel: string;
  referencePlaceholder: string;
  dateHint: string;
  /** Under the amount while it is blank. */
  idleHint: string;
  /** Under the amount once a valid one is typed: where the balance would stand. */
  preview: (amountText: string) => string | null;
  sameEntries: (a: F, b: F) => boolean;
  successMessage: (amount: number) => string;
  submitLabel: string;
  save: (form: F) => Promise<OfficePaymentResult>;
  isSaving: boolean;
  /** The entries of an earlier attempt whose outcome is unknown. */
  unknownAttempt: F | null;
}

const Form = <F extends OfficePaymentFields>({
  onClose,
  title,
  partyName,
  stationId,
  timeZone,
  schemaFor,
  defaultValues,
  methods,
  accountTypes,
  amountLabel,
  accountLabel,
  referencePlaceholder,
  dateHint: dateHelp,
  idleHint,
  preview: previewFor,
  sameEntries,
  successMessage,
  submitLabel,
  save,
  isSaving,
  unknownAttempt,
}: Omit<OfficePaymentSheetProps<F>, 'open' | 'label'>) => {
  const toast = useToast();
  const [refusal, setRefusal] = useState<string | null>(null);
  // Fixed while the sheet is open: the date the sheet opened on is today for this entry.
  const [today] = useState(() => entryDateToday(timeZone));
  const schema = useMemo(() => schemaFor(today), [schemaFor, today]);
  const ids = useId();
  const amountId = `${ids}-amount`;
  const amountHint = `${amountId}-hint`;
  const accountId = `${ids}-account`;
  const accountHint = `${accountId}-hint`;
  const dateId = `${ids}-date`;
  const dateHint = `${dateId}-hint`;
  const refId = `${ids}-ref`;

  // The fields every sheet has; `F` only adds the optional method, so the form is driven through its base shape.
  const { register, handleSubmit, watch, setValue, formState } = useForm<OfficePaymentFields>({
    resolver: zodResolver(schema) as Resolver<OfficePaymentFields>,
    defaultValues: defaultValues(today),
  });
  const { errors } = formState;

  const method = watch('paymentMethod');
  const amountText = watch('amount');
  const chosenAccount = watch('fundingAccountId');
  const entries = watch() as F;
  // An earlier try with no answer may have been recorded: say so before a different payment.
  const maybeRecorded =
    unknownAttempt && !sameEntries(unknownAttempt, entries) ? unknownAttempt : null;

  const accountsQ = useFundingAccounts(stationId);
  const accounts = useMemo(
    () => filterFundingAccounts(accountsQ.data ?? [], accountTypes(method)),
    [accountsQ.data, accountTypes, method],
  );
  // One match is preselected; a choice the method no longer allows is cleared.
  useEffect(() => {
    if (!accountsQ.isSuccess) return;
    const next = reconcileFundingSelection(chosenAccount, accounts);
    if (next !== chosenAccount) setValue('fundingAccountId', next, { shouldValidate: !!next });
  }, [accountsQ.isSuccess, accounts, chosenAccount, setValue]);

  const preview = previewFor(amountText);
  const clearRefusal = () => setRefusal(null);

  const submit = handleSubmit(async (data) => {
    setRefusal(null);
    const result = await save(data as F);
    if (result.ok) {
      toast.success(successMessage(Number(data.amount.trim())));
      onClose();
    } else {
      setRefusal(result.failure.message);
    }
  });

  const accountProblem = errors.fundingAccountId?.message;
  const accountNote = accountsQ.isLoading
    ? 'Loading accounts…'
    : accountsQ.isError
      ? 'Could not load accounts.'
      : accounts.length === 0
        ? methods
          ? 'No account takes this method. Ask the office to add one under Accounts.'
          : 'No account can pay this. Ask the office to add one under Accounts.'
        : null;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">{title}</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{partyName}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className="text-[11.5px] font-semibold text-text-muted">
          {amountLabel}
        </label>
        <input
          id={amountId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={amountHint}
          className={inputClass(Boolean(errors.amount))}
          {...register('amount', { onChange: clearRefusal })}
        />
        <p
          id={amountHint}
          className={`m-0 text-[11px] ${errors.amount ? 'text-bad-fg' : 'text-text-muted'}`}
        >
          {errors.amount?.message ?? preview ?? idleHint}
        </p>
      </div>

      {methods && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[11.5px] font-semibold text-text-muted">Method</legend>
          <SegmentedControl
            label="Payment method"
            options={methods}
            value={method ?? ''}
            onChange={(v) => {
              setValue('paymentMethod', v);
              clearRefusal();
            }}
            className=""
          />
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={accountId} className="text-[11.5px] font-semibold text-text-muted">
          {accountLabel}
        </label>
        <select
          id={accountId}
          aria-invalid={accountProblem ? true : undefined}
          aria-describedby={accountNote || accountProblem ? accountHint : undefined}
          disabled={accountsQ.isLoading || accounts.length === 0}
          className={`${inputClass(Boolean(accountProblem))} ${FIELD_TEXT}`}
          {...register('fundingAccountId', { onChange: clearRefusal })}
        >
          <option value="">Choose account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {accountTypeLabel(a.accountType)}
            </option>
          ))}
        </select>
        {(accountProblem || accountNote) && (
          <p
            id={accountHint}
            className={`m-0 text-[11px] ${accountProblem ? 'text-bad-fg' : 'text-text-muted'}`}
          >
            {accountProblem ?? accountNote}
          </p>
        )}
        {accountsQ.isError && (
          <button
            type="button"
            onClick={() => void accountsQ.refetch()}
            className="self-start text-[11px] font-bold text-accent"
          >
            Retry
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={dateId} className="text-[11.5px] font-semibold text-text-muted">
          Entry date
        </label>
        <input
          id={dateId}
          type="date"
          max={today}
          aria-invalid={errors.entryDate ? true : undefined}
          aria-describedby={dateHint}
          className={`${inputClass(Boolean(errors.entryDate))} ${FIELD_TEXT}`}
          {...register('entryDate', { onChange: clearRefusal })}
        />
        <p
          id={dateHint}
          className={`m-0 text-[11px] ${errors.entryDate ? 'text-bad-fg' : 'text-text-muted'}`}
        >
          {errors.entryDate?.message ?? dateHelp}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={refId} className="text-[11.5px] font-semibold text-text-muted">
          Reference (optional)
        </label>
        <input
          id={refId}
          type="text"
          autoComplete="off"
          placeholder={referencePlaceholder}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? `${refId}-hint` : undefined}
          className={`${inputClass(Boolean(errors.notes))} ${FIELD_TEXT}`}
          {...register('notes', { onChange: clearRefusal })}
        />
        {errors.notes && (
          <p id={`${refId}-hint`} className="m-0 text-[11px] text-bad-fg">
            {errors.notes.message}
          </p>
        )}
      </div>

      {refusal && (
        <p
          role="alert"
          className="m-0 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad-fg"
        >
          {refusal}
        </p>
      )}

      {maybeRecorded && (
        <p
          role="status"
          className="m-0 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] text-warn-fg"
        >
          Your earlier attempt of {inr(Number(maybeRecorded.amount.trim()))} may have gone through.
          Check the balance before recording a different payment.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 items-center justify-center rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent disabled:opacity-60"
        >
          {isSaving ? 'Recording…' : submitLabel}
        </button>
      </div>
    </form>
  );
};

/**
 * The Record payment bottom sheet both money pages use: amount, the Funding
 * Account (and, for a Collection, the method that decides which accounts suit),
 * the Entry Date and an optional reference. An Office Record (ADR 0005).
 *
 * It is the form only. The save (and with it the Idempotency-Key) lives in the
 * caller's always-mounted wrapper, not in the form that mounts only while the
 * sheet is open: closing the sheet after a dropped connection and reopening it
 * must reuse the same key, or the payment could be recorded twice.
 */
export const OfficePaymentSheet = <F extends OfficePaymentFields>({
  open,
  label,
  onClose,
  ...form
}: OfficePaymentSheetProps<F>) => (
  <BottomSheet open={open} onClose={onClose} label={label}>
    <Form onClose={onClose} {...form} />
  </BottomSheet>
);
