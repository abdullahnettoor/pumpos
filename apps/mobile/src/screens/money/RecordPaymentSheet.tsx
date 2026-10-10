import React, { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  accountTypeLabel,
  collectionAccountTypes,
  filterFundingAccounts,
  inr,
  reconcileFundingSelection,
  useFundingAccounts,
  useToast,
} from '@pump/ui';
import {
  amountAfterCollection,
  balanceAfterPayment,
  COLLECTION_METHODS,
  collectionFormSchema,
  entryDateToday,
  sameCollectionEntries,
  type CollectionForm,
} from '../../lib/money/collection.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { inputClass } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/BottomSheet.js';
import { SegmentedControl } from '../../ui/SegmentedControl.js';
import { useRecordCollection, type RecordCollectionResult } from './useRecordCollection.js';

interface Props {
  open: boolean;
  customer: MoneyCustomer;
  stationId: string;
  /** Station IANA timezone: the Entry Date defaults to today there. */
  timeZone?: string | null;
  onClose: () => void;
}

const FIELD_TEXT = '!font-sans !text-[15px] !font-medium';

/** What the customer would owe once the typed amount is in, in one line. */
const previewLine = (customer: MoneyCustomer, amountText: string): string | null => {
  const amount = Number(amountText.trim());
  if (amountText.trim() === '' || !Number.isFinite(amount) || amount <= 0) return null;
  const after = amountAfterCollection(balanceAfterPayment(balanceOf(customer), amount));
  if (after.kind === 'settled') return 'Settles the account: nothing left to pay.';
  if (after.kind === 'advance') return `${inr(after.amount)} paid ahead after this.`;
  return `${inr(after.amount)} still to collect after this.`;
};

const Form: React.FC<
  Omit<Props, 'open' | 'stationId'> & {
    stationId: string;
    save: (form: CollectionForm) => Promise<RecordCollectionResult>;
    isSaving: boolean;
    unknownAttempt: CollectionForm | null;
  }
> = ({ customer, stationId, timeZone, onClose, save, isSaving, unknownAttempt }) => {
  const toast = useToast();
  const [refusal, setRefusal] = useState<string | null>(null);
  // Fixed while the sheet is open: the date the sheet opened on is today for this entry.
  const [today] = useState(() => entryDateToday(timeZone));
  const schema = useMemo(() => collectionFormSchema(today), [today]);
  const ids = useId();
  const amountId = `${ids}-amount`;
  const amountHint = `${amountId}-hint`;
  const accountId = `${ids}-account`;
  const accountHint = `${accountId}-hint`;
  const dateId = `${ids}-date`;
  const dateHint = `${dateId}-hint`;
  const refId = `${ids}-ref`;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CollectionForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      paymentMethod: 'Cash',
      fundingAccountId: '',
      entryDate: today,
      notes: '',
    },
  });

  const method = watch('paymentMethod');
  const amountText = watch('amount');
  const chosenAccount = watch('fundingAccountId');
  const entries = watch();
  // An earlier try with no answer may have been recorded: say so before a different payment.
  const maybeRecorded =
    unknownAttempt && !sameCollectionEntries(unknownAttempt, entries) ? unknownAttempt : null;

  const accountsQ = useFundingAccounts(stationId);
  const accounts = useMemo(
    () => filterFundingAccounts(accountsQ.data ?? [], collectionAccountTypes(method)),
    [accountsQ.data, method],
  );
  // One match is preselected; a choice the method no longer allows is cleared.
  useEffect(() => {
    if (!accountsQ.isSuccess) return;
    const next = reconcileFundingSelection(chosenAccount, accounts);
    if (next !== chosenAccount) setValue('fundingAccountId', next, { shouldValidate: !!next });
  }, [accountsQ.isSuccess, accounts, chosenAccount, setValue]);

  const preview = previewLine(customer, amountText);
  const clearRefusal = () => setRefusal(null);

  const submit = handleSubmit(async (data) => {
    setRefusal(null);
    const result = await save(data);
    if (result.ok) {
      toast.success(`${inr(Number(data.amount.trim()))} recorded from ${customer.name}.`);
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
        ? 'No account takes this method. Ask the office to add one under Accounts.'
        : null;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Record payment</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{customer.name}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className="text-[11.5px] font-semibold text-text-muted">
          Amount received (₹)
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
          {errors.amount?.message ??
            preview ??
            `${inr(Math.max(0, balanceOf(customer)))} is owed now.`}
        </p>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[11.5px] font-semibold text-text-muted">Method</legend>
        <SegmentedControl
          label="Payment method"
          options={COLLECTION_METHODS}
          value={method}
          onChange={(v) => {
            setValue('paymentMethod', v);
            clearRefusal();
          }}
          className=""
        />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={accountId} className="text-[11.5px] font-semibold text-text-muted">
          Received into
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
          {errors.entryDate?.message ?? 'The day the money was received. Defaults to today.'}
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
          placeholder="UPI ref, cheque no., …"
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
          {isSaving ? 'Recording…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
};

/**
 * Bottom sheet to record a Collection from the Customer page: amount, method,
 * the Funding Account it landed in, the Entry Date and an optional reference.
 *
 * The save lives here, in the component that stays mounted, not in the form that
 * mounts only while the sheet is open: closing the sheet after a dropped
 * connection and reopening it must reuse the same Idempotency-Key, or the
 * payment could be recorded twice.
 */
export const RecordPaymentSheet: React.FC<Props> = ({
  open,
  customer,
  stationId,
  timeZone,
  onClose,
}) => {
  const { save, isSaving, unknownAttempt } = useRecordCollection(stationId, customer.id);
  return (
    <BottomSheet open={open} onClose={onClose} label="Record payment">
      <Form
        customer={customer}
        stationId={stationId}
        timeZone={timeZone}
        onClose={onClose}
        save={save}
        isSaving={isSaving}
        unknownAttempt={unknownAttempt}
      />
    </BottomSheet>
  );
};
