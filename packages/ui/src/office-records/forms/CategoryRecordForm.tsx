import React, { useCallback } from 'react';
import { expenseEntryFormSchema, type ExpenseEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput } from '../../components/primitives/Field.js';
import { Form } from '../../pump-ds/index.js';
import { useOfficeRecordContext } from '../context.js';
import { OFFICE_RECORD_KINDS } from '../kinds.js';
import { typedAmount, useReportDraft, type OfficeRecordFormProps } from '../draft.js';
import { RecordAmountInput } from '../fields/RecordAmountField.js';
import { RecordDateField } from '../fields/RecordDateField.js';
import { CategoryField, type CategoryKind } from '../fields/CategoryField.js';
import { FundingAccountField } from '../fields/FundingAccountField.js';

export interface CategoryRecordFormProps extends OfficeRecordFormProps<ExpenseEntryFormValues> {
  kind: CategoryKind;
  categories: readonly { id: string; name: string; taxConfig?: { gst_rate?: number } | null }[];
  canAddCategory: boolean;
  onSubmit: (values: ExpenseEntryFormValues) => Promise<void>;
}

const PLACEHOLDER: Record<CategoryKind, string> = {
  expense: 'e.g. KSEB bill for September',
  income: 'e.g. Tanker KL-11 AB 4410, 2 days',
};

/**
 * An expense or other income: entry date → category → amount → Funding
 * Account → description. Both are Office Records (ADR 0005): never a shift.
 */
export const CategoryRecordForm: React.FC<CategoryRecordFormProps> = ({
  kind,
  formId,
  categories,
  canAddCategory,
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
  } = useZodForm<ExpenseEntryFormValues>(expenseEntryFormSchema, {
    defaultValues: {
      entryDate: today,
      categoryId: '',
      amount: undefined as unknown as number,
      description: '',
      fundingAccountId: '',
      ...defaultValues,
    },
  });
  const values = watch();
  const set = useCallback(
    (name: 'entryDate' | 'categoryId' | 'fundingAccountId') => (v: string) =>
      setValue(name, v, { shouldValidate: !!v }),
    [setValue],
  );
  const onAccountChange = useCallback(
    (v: string) => setValue('fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );

  useReportDraft(
    {
      date: values.entryDate,
      amount: typedAmount(values.amount),
      categoryId: values.categoryId || undefined,
      accountId: values.fundingAccountId || undefined,
    },
    onDraftChange,
  );

  return (
    <Form id={formId} onSubmit={handleSubmit(onSubmit)}>
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <RecordDateField
          name="entryDate"
          value={values.entryDate}
          onChange={set('entryDate')}
          error={errors.entryDate?.message}
        />
        <CategoryField
          kind={kind}
          categories={categories}
          value={values.categoryId}
          onChange={set('categoryId')}
          canAdd={canAddCategory}
          error={errors.categoryId?.message}
        />
        <Field label="Amount" required error={errors.amount?.message}>
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
          hint={OFFICE_RECORD_KINDS[kind].accountHint}
          error={errors.fundingAccountId?.message}
        />
        <Field label="Description">
          <TextInput placeholder={PLACEHOLDER[kind]} {...register('description')} />
        </Field>
      </fieldset>
    </Form>
  );
};
