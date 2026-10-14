import React, { useCallback } from 'react';
import { collectionEntryFormSchema, type CollectionEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, MoneyInput, Select, TextInput } from '../../components/primitives/Field.js';
import { Form, SegmentedControl } from '../../pump-ds/index.js';
import { usePaymentTerminals } from '../../query/hooks.js';
import {
  collectionAccountTypes,
  methodUsesTerminal,
  terminalsForMethod,
  type CollectionMethod,
} from '../../utils/fundingAccounts.js';
import { inr } from '../../utils/format.js';
import { useOfficeRecordContext } from '../context.js';
import { OFFICE_RECORD_KINDS } from '../kinds.js';
import { typedAmount, useReportDraft, type OfficeRecordFormProps } from '../draft.js';
import { RecordDateField } from '../fields/RecordDateField.js';
import { FundingAccountField } from '../fields/FundingAccountField.js';
import { PartyField, type PartyOption } from '../fields/PartyField.js';

export interface CollectionFormProps extends OfficeRecordFormProps<CollectionEntryFormValues> {
  customers: readonly PartyOption[];
  lockedCustomer?: PartyOption | null;
  onSubmit: (values: CollectionEntryFormValues) => Promise<void>;
}

const METHODS: { value: CollectionMethod; label: string }[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BankTransfer', label: 'Bank transfer' },
];

/** A collection always names the customer who paid: there is no walk-in. */
const schema = collectionEntryFormSchema.superRefine((data, ctx) => {
  if (!data.customerId) {
    ctx.addIssue({
      code: 'custom',
      path: ['customerId'],
      message: 'Choose the customer who paid.',
    });
  }
});

/**
 * A customer collection, an Office Record (ADR 0005): entry date → customer →
 * method → amount → terminal or Funding Account → reference. A card/UPI
 * collection through a terminal posts to the terminal's clearing account.
 */
export const CollectionForm: React.FC<CollectionFormProps> = ({
  formId,
  customers,
  lockedCustomer,
  defaultValues,
  onDraftChange,
  onSubmit,
}) => {
  const { stationId, today, disabled } = useOfficeRecordContext();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm<CollectionEntryFormValues>(schema, {
    defaultValues: {
      entryDate: today,
      customerId: lockedCustomer?.id ?? '',
      amount: undefined as unknown as number,
      paymentMethod: 'Cash',
      notes: '',
      fundingAccountId: '',
      terminalId: '',
      ...defaultValues,
    },
  });
  const values = watch();
  const method = values.paymentMethod;
  const { data: terminalRows } = usePaymentTerminals(stationId);
  const terminals = terminalsForMethod(terminalRows ?? [], method);
  const usingTerminal = !!values.terminalId && methodUsesTerminal(method);
  const onAccountChange = useCallback(
    (v: string) => setValue('fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );
  const customer = lockedCustomer ?? customers.find((c) => c.id === values.customerId) ?? null;
  const amount = typedAmount(values.amount);

  useReportDraft(
    {
      date: values.entryDate,
      amount,
      partyId: values.customerId || undefined,
      accountId: usingTerminal ? undefined : values.fundingAccountId || undefined,
      terminalId: usingTerminal ? values.terminalId : undefined,
    },
    onDraftChange,
  );

  const due = customer?.balance ?? null;
  const amountHint =
    due == null
      ? undefined
      : amount != null && amount > due
        ? `More than is due: ${inr(amount - Math.max(due, 0))} becomes an advance.`
        : amount != null && amount > 0
          ? `${inr(due)} due → ${inr(due - amount)} after this.`
          : `${inr(due)} due.`;

  return (
    <Form
      id={formId}
      onSubmit={handleSubmit((v) =>
        onSubmit(methodUsesTerminal(v.paymentMethod) ? v : { ...v, terminalId: '' }),
      )}
    >
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <RecordDateField
          name="entryDate"
          value={values.entryDate}
          onChange={(v) => setValue('entryDate', v, { shouldValidate: !!v })}
          error={errors.entryDate?.message}
        />
        <PartyField
          party="customer"
          options={customers}
          locked={lockedCustomer}
          value={values.customerId ?? ''}
          onChange={(v) => setValue('customerId', v, { shouldValidate: true })}
          error={errors.customerId?.message}
        />
        <Field label="Method" required>
          <SegmentedControl
            aria-label="Method"
            options={METHODS}
            value={method}
            disabled={disabled}
            onChange={(v) => {
              setValue('paymentMethod', v, { shouldValidate: true });
              // A terminal only fits the method it was chosen for.
              setValue('terminalId', '');
            }}
          />
        </Field>
        <Field label="Amount" required error={errors.amount?.message} hint={amountHint}>
          <MoneyInput
            aria-label="Amount"
            placeholder="0.00"
            step="0.01"
            invalid={!!errors.amount}
            {...register('amount')}
          />
        </Field>
        {terminals.length > 0 && (
          <Field
            label="Payment terminal"
            hint={
              usingTerminal
                ? "Posts to the terminal's clearing account; settles to the bank with the batch."
                : undefined
            }
          >
            <Select aria-label="Payment terminal" {...register('terminalId')}>
              <option value="">None, straight to an account</option>
              {terminals.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!usingTerminal && (
          <FundingAccountField
            name={`${formId}-account`}
            value={values.fundingAccountId ?? ''}
            onChange={onAccountChange}
            types={collectionAccountTypes(method)}
            hint={OFFICE_RECORD_KINDS.collection.accountHint}
            error={errors.fundingAccountId?.message}
          />
        )}
        <Field label="Reference">
          <TextInput placeholder="UTR, cheque no. or fleet slip" {...register('notes')} />
        </Field>
      </fieldset>
    </Form>
  );
};
