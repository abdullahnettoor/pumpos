import React, { useCallback } from 'react';
import {
  collectionEntryFormSchema,
  resolveEntryDate,
  type CollectionEntryFormValues,
} from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { Segmented } from '../primitives/Segmented.js';
import { Combobox } from '../primitives/Combobox.js';
import { FundingAccountSelect } from '../primitives/FundingAccountSelect.js';
import { usePaymentTerminals, useStationTimeZone } from '../../query/hooks.js';
import {
  collectionAccountTypes,
  methodUsesTerminal,
  terminalsForMethod,
} from '../../utils/fundingAccounts.js';
import { Button, Form } from '../../pump-ds/index.js';

export interface CollectionEntryFormProps {
  customers: any[];
  /** Station whose funding accounts and terminals populate the pickers. */
  stationId?: string | null;
  /** Station timezone — the entry date defaults to today there. */
  timeZone?: string | null;
  defaultValues?: Partial<CollectionEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: CollectionEntryFormValues) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  amountLabel?: string;
  amountPlaceholder?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  paymentMethodLabel?: string;
  usePaymentMethodButtons?: boolean;
  walkInOptionLabel?: string;
  customerLabel?: string;
  customerOptionLabel?: (customer: any) => string;
  /** Collections are receivable payments — require a customer (no walk-in). */
  requireCustomer?: boolean;
  dateLabel?: string;
}

const EMPTY_DEFAULTS: Omit<CollectionEntryFormValues, 'entryDate'> = {
  customerId: '',
  amount: undefined as unknown as number,
  paymentMethod: 'Cash',
  notes: '',
  fundingAccountId: '',
  terminalId: '',
};

/**
 * A customer collection — an Office Record (ADR 0005): entry date + the account
 * the money lands in (or, for Card/UPI, the terminal it went through). Never a shift.
 *
 * Remounted when the defaults change rather than reset by an effect — the same
 * treatment as PurchaseEntryForm. The defaults are the form's *initial* values,
 * so mounting fresh says that directly, and there is no effect to keep honest.
 */
export const CollectionEntryForm: React.FC<CollectionEntryFormProps> = (props) => (
  <CollectionEntryFormBody key={JSON.stringify(props.defaultValues ?? {})} {...props} />
);

const CollectionEntryFormBody: React.FC<CollectionEntryFormProps> = ({
  customers,
  stationId,
  timeZone,
  defaultValues,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Log Collection',
  submittingLabel = 'Saving...',
  amountLabel = 'Amount (INR)',
  amountPlaceholder,
  notesLabel = 'Notes',
  notesPlaceholder,
  paymentMethodLabel = 'Payment Method',
  usePaymentMethodButtons = false,
  walkInOptionLabel = 'Walk-in / Not Linked',
  customerLabel = 'Customer Account (Optional for Walk-in)',
  customerOptionLabel,
  requireCustomer = false,
  dateLabel = 'Entry date',
}) => {
  const stationTimeZone = useStationTimeZone(stationId);
  const today = resolveEntryDate({ timeZone: timeZone ?? stationTimeZone });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useZodForm<CollectionEntryFormValues>(collectionEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, entryDate: today, ...defaultValues },
  });

  const paymentMethod = watch('paymentMethod');
  const customerId = watch('customerId');
  const terminalId = watch('terminalId');
  const { data: terminalRows } = usePaymentTerminals(stationId);
  const terminals = terminalsForMethod(terminalRows ?? [], paymentMethod);
  const usingTerminal = !!terminalId && methodUsesTerminal(paymentMethod);
  const onAccountChange = useCallback(
    (v: string) => setValue('fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );

  const changeMethod = (v: CollectionEntryFormValues['paymentMethod']) => {
    setValue('paymentMethod', v, { shouldValidate: true });
    // A terminal only fits the method it was chosen for.
    setValue('terminalId', '');
  };

  return (
    <Form
      onSubmit={handleSubmit((values) => {
        if (requireCustomer && !values.customerId) {
          setError('customerId', {
            type: 'manual',
            message: 'Select a customer for this collection.',
          });
          return;
        }
        return onSubmit(
          methodUsesTerminal(values.paymentMethod) ? values : { ...values, terminalId: '' },
        );
      })}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <Field label={dateLabel} error={errors.entryDate?.message}>
        <DateField
          max={today}
          disabled={submitting}
          invalid={!!errors.entryDate}
          {...register('entryDate')}
        />
      </Field>

      <Field label={paymentMethodLabel}>
        {usePaymentMethodButtons ? (
          <Segmented
            options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'Card', label: 'Card' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BankTransfer', label: 'Bank' },
            ]}
            value={paymentMethod}
            onChange={changeMethod}
            disabled={submitting}
            aria-label={paymentMethodLabel}
          />
        ) : (
          <Select
            disabled={submitting}
            value={paymentMethod}
            onChange={(e) =>
              changeMethod(e.target.value as CollectionEntryFormValues['paymentMethod'])
            }
          >
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="BankTransfer">Bank</option>
          </Select>
        )}
      </Field>

      <Field
        label={requireCustomer ? 'Customer Account' : customerLabel}
        error={errors.customerId?.message}
      >
        <Combobox
          options={[
            ...(requireCustomer ? [] : [{ value: '', label: walkInOptionLabel }]),
            ...customers.map((customer) => ({
              value: customer.id,
              label: customerOptionLabel ? customerOptionLabel(customer) : customer.name,
            })),
          ]}
          value={customerId ?? ''}
          onChange={(v) => {
            setValue('customerId', v, { shouldValidate: true });
            if (v) clearErrors('customerId');
          }}
          placeholder={requireCustomer ? 'Select a customer…' : walkInOptionLabel}
          searchPlaceholder="Search customers…"
          disabled={submitting}
        />
      </Field>

      <Field label={amountLabel} error={errors.amount?.message}>
        <NumberInput
          placeholder={amountPlaceholder}
          disabled={submitting}
          invalid={!!errors.amount}
          {...register('amount')}
        />
      </Field>

      {terminals.length > 0 && (
        <Field label="Payment terminal">
          <Select disabled={submitting} {...register('terminalId')}>
            <option value="">None</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Received into"
        error={usingTerminal ? undefined : errors.fundingAccountId?.message}
        hint={usingTerminal ? "Posts to the terminal's clearing account" : undefined}
      >
        {usingTerminal ? null : (
          <FundingAccountSelect
            stationId={stationId}
            value={watch('fundingAccountId') || ''}
            onChange={onAccountChange}
            types={collectionAccountTypes(paymentMethod)}
            disabled={submitting}
            invalid={!!errors.fundingAccountId}
          />
        )}
      </Field>

      <Field label={notesLabel}>
        <TextInput placeholder={notesPlaceholder} disabled={submitting} {...register('notes')} />
      </Field>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            border: '1px solid var(--border-soft)',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
};
