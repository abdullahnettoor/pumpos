import React, { useEffect, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, Textarea, Select } from '../primitives/Field.js';
import { Button } from '../../pump-ds/index.js';
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
export const TopupDrawer: React.FC<TopupDrawerProps> = ({ isOpen, customer, stationId, onClose, onDone }) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'BankTransfer'>('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAmount('');
    setPaymentMethod('Cash');
    setNotes('');
    setError(null);
  }, [isOpen]);

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
      invalidateOperational(stationId);
      toast.success('Top-up recorded.');
      onClose();
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record top-up');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Prepaid Wallet Top-Up">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <Field label="Amount" required>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} disabled={submitting} placeholder="0.00" step="0.01" />
        </Field>

        <Field label="Payment Method" required>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} disabled={submitting}>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="UPI">UPI</option>
            <option value="BankTransfer">Bank Transfer</option>
          </Select>
        </Field>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} placeholder="Optional reference or remark" />
        </Field>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!amount}>Record Top-Up</Button>
          <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
};
