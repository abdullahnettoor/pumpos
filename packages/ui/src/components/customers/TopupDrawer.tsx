import React, { useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, Textarea, Select } from '../primitives/Field.js';
import { Button, Form } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface TopupDrawerProps {
  isOpen: boolean;
  /** Customer whose prepaid wallet is being topped up. */
  customer: any | null;
  stationId: string | null;
  onClose: () => void;
  /** Called after a successful top-up (e.g. to refresh the open statement). */
  onDone?: () => void;
}

/** Prepaid wallet top-up. Self-contained: owns its form + save + toast. */
export const TopupDrawer: React.FC<TopupDrawerProps> = ({
  isOpen,
  customer,
  stationId,
  onClose,
  onDone,
}) => (
  <Drawer isOpen={isOpen} onClose={onClose} title="Prepaid Wallet Top-Up">
    {/*
     * `Drawer` renders nothing while closed, so the form below unmounts on close
     * and comes back with fresh state — no reset-on-open effect needed. The key
     * covers the one case unmounting does not: swapping customer while open.
     */}
    <TopupForm
      key={customer?.id ?? 'none'}
      customer={customer}
      stationId={stationId}
      onClose={onClose}
      onDone={onDone}
    />
  </Drawer>
);

const TopupForm: React.FC<Omit<TopupDrawerProps, 'isOpen'>> = ({
  customer,
  stationId,
  onClose,
  onDone,
}) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'BankTransfer'>(
    'Cash',
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer?.id || !amount) return;
    try {
      setSubmitting(true);
      setError(null);
      await transactionService.topupCustomer(customer.id, {
        amount: Number(amount),
        paymentMethod,
        notes: notes || undefined,
      });
      toast.success('Top-up recorded.');
      await invalidateOperational(stationId);
      onClose();
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record top-up');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="rounded-input bg-danger-bg px-3 py-2 text-[12px] text-danger-fg"
        >
          {error}
        </div>
      )}

      <Field label="Amount" required>
        <MoneyInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={submitting}
          placeholder="0.00"
          step="0.01"
        />
      </Field>

      <Field label="Payment Method" required>
        <Select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as any)}
          disabled={submitting}
        >
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="UPI">UPI</option>
          <option value="BankTransfer">Bank Transfer</option>
        </Select>
      </Field>

      <Field label="Notes">
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Optional reference or remark"
        />
      </Field>

      <div className="mt-2 flex gap-2.5">
        <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!amount}>
          Record Top-Up
        </Button>
        <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Form>
  );
};
