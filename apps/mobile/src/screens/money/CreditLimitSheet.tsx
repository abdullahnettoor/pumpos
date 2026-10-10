import React, { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inr, useToast } from '@pump/ui';
import {
  creditLimitFormSchema,
  LIMIT_NOTE_MAX,
  noteToSend,
  parseCreditLimit,
  previewStanding,
  type CreditLimitForm,
} from '../../lib/money/creditLimit.js';
import { limitOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { inputClass } from '../../components/handover/Fields.js';
import { BottomSheet } from '../../ui/BottomSheet.js';
import { useCreditLimitEdit } from './useCreditLimitEdit.js';

interface Props {
  open: boolean;
  customer: MoneyCustomer;
  onClose: () => void;
}

/** What the new limit would mean for what they owe now, in one line. */
const previewLine = (customer: MoneyCustomer, text: string): string | null => {
  const parsed = parseCreditLimit(text);
  if (!parsed.ok) return null;
  const s = previewStanding(customer, parsed.value);
  if (parsed.value === null) return 'No limit: sales on credit will not be capped.';
  if (s.state === 'over') return `Still over the limit by ${inr(s.overBy)}.`;
  if (s.state === 'near' || s.state === 'under')
    return `${inr(s.room)} of room left · ${s.usedPct}% used.`;
  return 'Nothing owed, so the full limit is open.';
};

const Form: React.FC<Omit<Props, 'open'>> = ({ customer, onClose }) => {
  const toast = useToast();
  const { save, isSaving } = useCreditLimitEdit(customer.id);
  const [refusal, setRefusal] = useState<string | null>(null);
  const current = limitOf(customer);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const noteId = `${fieldId}-note`;
  const noteHintId = `${noteId}-hint`;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreditLimitForm>({
    resolver: zodResolver(creditLimitFormSchema),
    defaultValues: { creditLimit: current === null ? '' : String(current), note: '' },
  });

  const text = watch('creditLimit');
  const parsed = parseCreditLimit(text);
  const unchanged = parsed.ok && parsed.value === current;
  const preview = previewLine(customer, text);
  const error = errors.creditLimit?.message;
  const noteError = errors.note?.message;

  const submit = handleSubmit(async (data) => {
    setRefusal(null);
    const limit = parseCreditLimit(data.creditLimit);
    if (!limit.ok) return;
    const result = await save(limit.value, noteToSend(data.note));
    if (result.ok) {
      toast.success(limit.value === null ? 'Credit limit removed.' : 'Credit limit updated.');
      onClose();
    } else {
      setRefusal(result.failure.message);
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="m-0 text-[15px] font-bold text-text-high">Credit limit</h2>
        <p className="m-0 mt-0.5 truncate text-xs text-text-muted">{customer.name}</p>
      </div>

      <p className="m-0 flex items-baseline justify-between text-[12.5px] text-text-muted">
        <span>Current limit</span>
        <span className="num font-semibold text-text-high">
          {current === null ? 'None' : inr(current)}
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-[11.5px] font-semibold text-text-muted">
          New limit (₹)
        </label>
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="No limit"
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          className={inputClass(Boolean(error))}
          {...register('creditLimit', { onChange: () => setRefusal(null) })}
        />
        <p id={hintId} className={`m-0 text-[11px] ${error ? 'text-bad-fg' : 'text-text-muted'}`}>
          {error ?? preview ?? 'Leave blank for no limit.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-[11.5px] font-semibold text-text-muted">
          Note (optional)
        </label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={LIMIT_NOTE_MAX}
          placeholder="Why the limit is changing"
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteHintId}
          className={`${inputClass(Boolean(noteError), 'min-h-[64px]')} resize-none py-2 !font-sans !text-sm !font-normal`}
          {...register('note', { onChange: () => setRefusal(null) })}
        />
        <p
          id={noteHintId}
          className={`m-0 text-[11px] ${noteError ? 'text-bad-fg' : 'text-text-muted'}`}
        >
          {noteError ?? 'Kept with the change in the activity log.'}
        </p>
      </div>

      {refusal && (
        <p
          role="alert"
          className="m-0 rounded-xl border border-bad-line bg-bad-soft px-3 py-2 text-[12.5px] text-bad-fg"
        >
          {refusal}
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
          disabled={isSaving || unchanged}
          className="flex h-11 items-center justify-center rounded-[13px] bg-accent text-[13.5px] font-bold text-on-accent disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save limit'}
        </button>
      </div>
    </form>
  );
};

/**
 * Bottom sheet to change a Customer's credit limit. The form mounts only while
 * the sheet is open, so it always starts from the Customer's current limit.
 */
export const CreditLimitSheet: React.FC<Props> = ({ open, customer, onClose }) => (
  <BottomSheet open={open} onClose={onClose} label="Edit credit limit">
    <Form customer={customer} onClose={onClose} />
  </BottomSheet>
);
