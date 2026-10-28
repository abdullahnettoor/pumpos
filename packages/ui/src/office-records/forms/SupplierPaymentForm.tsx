import React, { useCallback } from 'react';
import { supplierPaymentEntryFormSchema, type SupplierPaymentEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput } from '../../components/primitives/Field.js';
import { Form } from '../../pump-ds/index.js';
import { SUPPLIER_PAYMENT_ACCOUNT_TYPES } from '../../utils/fundingAccounts.js';
import { inr } from '../../utils/format.js';
import { useOfficeRecordContext } from '../context.js';
import { OFFICE_RECORD_KINDS } from '../kinds.js';
import { partPaymentText } from '../preview.js';
import { typedAmount, useReportDraft, type OfficeRecordFormProps } from '../draft.js';
import { RecordAmountInput } from '../fields/RecordAmountField.js';
import { RecordDateField } from '../fields/RecordDateField.js';
import { FundingAccountField } from '../fields/FundingAccountField.js';
import { PartyField, type PartyOption } from '../fields/PartyField.js';

export interface SupplierPaymentFormProps extends OfficeRecordFormProps<SupplierPaymentEntryFormValues> {
  suppliers: readonly PartyOption[];
  lockedSupplier?: PartyOption | null;
  onSubmit: (values: SupplierPaymentEntryFormValues) => Promise<void>;
}

const schema = supplierPaymentEntryFormSchema.superRefine((data, ctx) => {
  if (!data.supplierId) {
    ctx.addIssue({ code: 'custom', path: ['supplierId'], message: 'Choose the supplier.' });
  }
});

/** What is owed, as the amount field's starting value. */
const owedAmount = (s: PartyOption | null | undefined) =>
  s?.balance != null && s.balance > 0 ? Number(s.balance.toFixed(2)) : undefined;

/**
 * A payment to a supplier, an Office Record (ADR 0005): entry date → supplier →
 * amount (what is owed, to start) → Funding Account (the CMS wallet too) →
 * reference.
 */
export const SupplierPaymentForm: React.FC<SupplierPaymentFormProps> = ({
  formId,
  suppliers,
  lockedSupplier,
  defaultValues,
  onDraftChange,
  onSubmit,
}) => {
  const { today, disabled } = useOfficeRecordContext();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm<SupplierPaymentEntryFormValues>(schema, {
    defaultValues: {
      entryDate: today,
      supplierId: lockedSupplier?.id ?? '',
      amount: owedAmount(lockedSupplier) as unknown as number,
      notes: '',
      fundingAccountId: '',
      ...defaultValues,
    },
  });
  const values = watch();
  const onAccountChange = useCallback(
    (v: string) => setValue('fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );
  const supplier = lockedSupplier ?? suppliers.find((s) => s.id === values.supplierId) ?? null;
  const amount = typedAmount(values.amount);

  useReportDraft(
    {
      date: values.entryDate,
      amount,
      partyId: values.supplierId || undefined,
      accountId: values.fundingAccountId || undefined,
    },
    onDraftChange,
  );

  const owed = supplier?.balance ?? null;
  const amountHint =
    owed == null ? undefined : (partPaymentText(owed, amount) ?? `${inr(owed)} owed.`);

  return (
    <Form id={formId} onSubmit={handleSubmit(onSubmit)}>
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <RecordDateField
          name="entryDate"
          value={values.entryDate}
          onChange={(v) => setValue('entryDate', v, { shouldValidate: !!v })}
          error={errors.entryDate?.message}
        />
        <PartyField
          party="supplier"
          options={suppliers}
          locked={lockedSupplier}
          value={values.supplierId ?? ''}
          onChange={(id) => {
            setValue('supplierId', id, { shouldValidate: true });
            const next = suppliers.find((s) => s.id === id);
            setValue('amount', owedAmount(next) as unknown as number);
          }}
          error={errors.supplierId?.message}
        />
        <Field label="Amount" required error={errors.amount?.message} hint={amountHint}>
          <RecordAmountInput
            aria-label="Amount"
            invalid={!!errors.amount}
            {...register('amount')}
          />
        </Field>
        <FundingAccountField
          name={`${formId}-account`}
          value={values.fundingAccountId}
          onChange={onAccountChange}
          types={SUPPLIER_PAYMENT_ACCOUNT_TYPES}
          hint={OFFICE_RECORD_KINDS['supplier-payment'].accountHint}
          error={errors.fundingAccountId?.message}
        />
        <Field label="Reference">
          <TextInput placeholder="Cheque no. or RTGS reference" {...register('notes')} />
        </Field>
      </fieldset>
    </Form>
  );
};
