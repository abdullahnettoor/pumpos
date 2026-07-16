import React, { useEffect, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Field, MoneyInput, TextInput } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';
import { AccountSelect } from '../primitives/AccountSelect.js';
import { Button } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface SupplierPaymentDrawerProps {
  isOpen: boolean;
  /** Fixed supplier being paid (from a statement). Omit for a standalone launch. */
  supplier?: any | null;
  /** Pick list for a standalone launch (when no fixed `supplier`). */
  suppliers?: any[];
  stationId: string | null;
  onClose: () => void;
  /** Called after a successful payment (e.g. to refresh the open statement). */
  onDone?: () => void;
}

/**
 * Record a payment to a supplier (reduces the payable). Self-contained: owns its
 * form + save + toast. Business-day anchored and account-driven — the chosen
 * pay-from account decides drawer impact server-side (no shift required for
 * bank/owner payments). Amount defaults to the outstanding balance.
 */
export const SupplierPaymentDrawer: React.FC<SupplierPaymentDrawerProps> = ({ isOpen, supplier, suppliers, stationId, onClose, onDone }) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedSupplier = supplier ?? (suppliers || []).find((s: any) => s.id === selectedSupplierId) ?? null;
  const owed = Number(resolvedSupplier?.currentBalance || 0);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setAccountId('');
    setNotes('');
    if (supplier) {
      setSelectedSupplierId(supplier.id);
      const o = Number(supplier.currentBalance || 0);
      setAmount(o > 0 ? o.toFixed(2) : '');
    } else {
      setSelectedSupplierId('');
      setAmount('');
    }
  }, [isOpen, supplier]);

  const onPickSupplier = (id: string) => {
    setSelectedSupplierId(id);
    const s = (suppliers || []).find((x: any) => x.id === id);
    const o = Number(s?.currentBalance || 0);
    setAmount(o > 0 ? o.toFixed(2) : '');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedSupplier?.id || !amount || Number(amount) <= 0) return;
    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordSupplierPayment({
        stationId: stationId ?? undefined,
        supplierId: resolvedSupplier.id,
        amount: Number(amount),
        accountId: accountId || undefined,
        notes: notes || undefined,
      });
      invalidateOperational(stationId);
      toast.success('Supplier payment recorded.');
      onClose();
      onDone?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record supplier payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Record Supplier Payment">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        {!supplier && (
          <Field label="Supplier" required>
            <Combobox
              options={(suppliers || []).map((s: any) => ({ value: s.id, label: s.name, sublabel: Number(s.currentBalance || 0) > 0 ? `${inr(Number(s.currentBalance))} due` : undefined }))}
              value={selectedSupplierId}
              onChange={onPickSupplier}
              placeholder="Select supplier…"
              searchPlaceholder="Search suppliers…"
              disabled={submitting}
            />
          </Field>
        )}

        {resolvedSupplier && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '10px 12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{resolvedSupplier.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Owed <strong style={{ color: owed > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>{inr(owed)}</strong>
            </span>
          </div>
        )}

        <Field label="Amount" required>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} disabled={submitting} placeholder="0.00" step="0.01" />
        </Field>

        <Field label="Pay from account">
          <AccountSelect stationId={stationId} value={accountId} onChange={setAccountId} disabled={submitting} />
        </Field>

        <Field label="Payment ref / notes">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} placeholder="Cheque, RTGS ref…" />
        </Field>

        {Number(amount) > 0 && owed > 0 && Number(amount) < owed && (
          <span style={{ fontSize: '11px', color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>
            Partial — {inr(owed - Number(amount))} will remain outstanding.
          </span>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!resolvedSupplier || !amount || Number(amount) <= 0}>Record Payment</Button>
          <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
};
