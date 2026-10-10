import React from 'react';
import { inr, SUPPLIER_PAYMENT_ACCOUNT_TYPES } from '@pump/ui';
import { previewBalance } from '../../lib/money/officePayment.js';
import { balanceOf, type MoneySupplier } from '../../lib/money/parties.js';
import {
  sameSupplierPaymentEntries,
  supplierPaymentFormSchema,
  type SupplierPaymentForm,
} from '../../lib/money/supplierPayment.js';
import { OfficePaymentSheet } from './OfficePaymentSheet.js';
import { useRecordSupplierPayment } from './useRecordSupplierPayment.js';

interface Props {
  open: boolean;
  supplier: MoneySupplier;
  stationId: string;
  /** Station IANA timezone: the Entry Date defaults to today there. */
  timeZone?: string | null;
  onClose: () => void;
}

const defaultValues = (today: string): SupplierPaymentForm => ({
  amount: '',
  fundingAccountId: '',
  entryDate: today,
  notes: '',
});

// Module level: the sheet keys its memo on it. A supplier may be paid from any
// office account (and the OMC CMS account), whatever the method.
const accountTypes = () => SUPPLIER_PAYMENT_ACCOUNT_TYPES;

/** Where the payable stands before any amount is typed. */
const idleHint = (balance: number): string => {
  if (balance > 0.005) return `${inr(balance)} is owed now.`;
  if (balance < -0.005) return `${inr(-balance)} is already paid ahead.`;
  return 'Nothing is owed now.';
};

/**
 * Bottom sheet to record a Supplier Payment from the Supplier page: amount, the
 * Funding Account it is paid from, the Entry Date and an optional reference. The
 * form is the shared `OfficePaymentSheet`; the save lives here, in the component
 * that stays mounted (see `useRecordSupplierPayment`).
 */
export const PaySupplierSheet: React.FC<Props> = ({
  open,
  supplier,
  stationId,
  timeZone,
  onClose,
}) => {
  const { save, isSaving, unknownAttempt } = useRecordSupplierPayment(stationId, supplier.id);
  const balance = balanceOf(supplier);

  /** What would still be owed once the typed amount is paid, in one line. */
  const preview = (amountText: string): string | null => {
    const after = previewBalance(balance, amountText);
    if (!after) return null;
    if (after.kind === 'settled') return 'Settles the account: nothing left to pay.';
    if (after.kind === 'advance') return `${inr(after.amount)} paid ahead after this.`;
    return `${inr(after.amount)} still owed after this.`;
  };

  return (
    <OfficePaymentSheet<SupplierPaymentForm>
      open={open}
      onClose={onClose}
      label="Record supplier payment"
      title="Record payment"
      partyName={supplier.name}
      stationId={stationId}
      timeZone={timeZone}
      schemaFor={supplierPaymentFormSchema}
      defaultValues={defaultValues}
      accountTypes={accountTypes}
      amountLabel="Amount paid (₹)"
      accountLabel="Paid from"
      referencePlaceholder="Cheque no., RTGS / NEFT ref, …"
      dateHint="The day the payment was made. Defaults to today."
      idleHint={idleHint(balance)}
      preview={preview}
      sameEntries={sameSupplierPaymentEntries}
      successMessage={(amount) => `${inr(amount)} paid to ${supplier.name}.`}
      submitLabel="Record payment"
      save={save}
      isSaving={isSaving}
      unknownAttempt={unknownAttempt}
    />
  );
};
