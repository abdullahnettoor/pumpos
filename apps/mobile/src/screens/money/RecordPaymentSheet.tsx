import React from 'react';
import { collectionAccountTypes, inr } from '@pump/ui';
import {
  COLLECTION_METHODS,
  collectionFormSchema,
  type CollectionForm,
  type CollectionMethod,
} from '../../lib/money/collection.js';
import { previewBalance } from '../../lib/money/officePayment.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { OfficePaymentSheet } from './OfficePaymentSheet.js';
import { useRecordCollection } from './useRecordCollection.js';

interface Props {
  open: boolean;
  customer: MoneyCustomer;
  stationId: string;
  /** Station IANA timezone: the Entry Date defaults to today there. */
  timeZone?: string | null;
  onClose: () => void;
}

const defaultValues = (today: string): CollectionForm => ({
  amount: '',
  paymentMethod: 'Cash',
  fundingAccountId: '',
  entryDate: today,
  notes: '',
});

// Module level: the sheet keys its memo and its resolver on these.
const accountTypes = (method: string | undefined) =>
  collectionAccountTypes((method ?? 'Cash') as CollectionMethod);

/**
 * Bottom sheet to record a Collection from the Customer page: amount, method,
 * the Funding Account it landed in, the Entry Date and an optional reference.
 * The form is the shared `OfficePaymentSheet`; the save lives here, in the
 * component that stays mounted (see `useRecordCollection`).
 */
export const RecordPaymentSheet: React.FC<Props> = ({
  open,
  customer,
  stationId,
  timeZone,
  onClose,
}) => {
  const { save, isSaving, unknownAttempt } = useRecordCollection(stationId, customer.id);
  const balance = balanceOf(customer);

  /** What the customer would owe once the typed amount is in, in one line. */
  const preview = (amountText: string): string | null => {
    const after = previewBalance(balance, amountText);
    if (!after) return null;
    if (after.kind === 'settled') return 'Settles the account: nothing left to pay.';
    if (after.kind === 'advance') return `${inr(after.amount)} paid ahead after this.`;
    return `${inr(after.amount)} still to collect after this.`;
  };

  return (
    <OfficePaymentSheet<CollectionForm>
      open={open}
      onClose={onClose}
      label="Record payment"
      title="Record payment"
      partyName={customer.name}
      stationId={stationId}
      timeZone={timeZone}
      schemaFor={collectionFormSchema}
      defaultValues={defaultValues}
      methods={COLLECTION_METHODS}
      accountTypes={accountTypes}
      amountLabel="Amount received (₹)"
      accountLabel="Received into"
      referencePlaceholder="UPI ref, cheque no., …"
      dateHint="The day the money was received. Defaults to today."
      idleHint={`${inr(Math.max(0, balance))} is owed now.`}
      preview={preview}
      successMessage={(amount) => `${inr(amount)} recorded from ${customer.name}.`}
      submitLabel="Record payment"
      save={save}
      isSaving={isSaving}
      unknownAttempt={unknownAttempt}
    />
  );
};
