import React, { useState } from 'react';
import { resolveEntryDate, supplierPaymentEntryFormSchema } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { DateField, Field, MoneyInput, TextInput } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';
import { FundingAccountSelect } from '../primitives/FundingAccountSelect.js';
import { SUPPLIER_PAYMENT_ACCOUNT_TYPES } from '../../utils/fundingAccounts.js';
import { Button, Form } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { createIdempotencyKey } from '../../query/handoverMutation.js';
import { supplierPaymentPayload } from '../../utils/officeRecordPayloads.js';
import { keepsIdempotencyKey } from '../../utils/idempotency.js';
import { useInvalidateOperational, useStationTimeZone } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

/**
 * The Idempotency-Key of a payment whose outcome is still UNKNOWN (a network drop,
 * a 5xx), per station + supplier. It outlives the drawer so closing and reopening
 * it and saving again cannot record the payment twice: the API answers the same
 * key with the first result (or refuses an edited retry as a conflict). A decided
 * answer (success, or a 4xx) clears it.
 */
const pendingKeys = new Map<string, string>();

interface SupplierPaymentDrawerProps {
  isOpen: boolean;
  /** Fixed supplier being paid (from a statement). Omit for a standalone launch. */
  supplier?: any | null;
  /** Pick list for a standalone launch (when no fixed `supplier`). */
  suppliers?: any[];
  stationId: string | null;
  /** Station timezone — the entry date defaults to today there. */
  timeZone?: string | null;
  onClose: () => void;
  /** Called after a successful payment (e.g. to refresh the open statement). */
  onDone?: () => void | Promise<unknown>;
}

/**
 * Record a payment to a supplier (reduces the payable). Self-contained: owns its
 * form + save + toast. An Office Record (ADR 0005): entry date + the account it
 * is paid from, never a shift. Amount defaults to the outstanding balance.
 */
export const SupplierPaymentDrawer: React.FC<SupplierPaymentDrawerProps> = ({
  isOpen,
  onClose,
  ...rest
}) => (
  <Drawer isOpen={isOpen} onClose={onClose} title="Record Supplier Payment">
    {/*
     * `Drawer` renders nothing while closed, so the form below unmounts on close
     * and is rebuilt from props on open — no reset-on-open effect needed. The key
     * covers what unmounting does not: switching supplier while the drawer stays open.
     */}
    <SupplierPaymentForm key={rest.supplier?.id ?? 'pick'} onClose={onClose} {...rest} />
  </Drawer>
);

const SupplierPaymentForm: React.FC<Omit<SupplierPaymentDrawerProps, 'isOpen'>> = ({
  supplier,
  suppliers,
  stationId,
  timeZone,
  onClose,
  onDone,
}) => {
  const stationTimeZone = useStationTimeZone(stationId);
  const today = resolveEntryDate({ timeZone: timeZone ?? stationTimeZone });
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  // Prefilling the owed amount is the initial value, not a reaction to a change.
  const [selectedSupplierId, setSelectedSupplierId] = useState(supplier?.id ?? '');
  const [amount, setAmount] = useState(() => {
    const owedNow = Number(supplier?.currentBalance || 0);
    return supplier && owedNow > 0 ? owedNow.toFixed(2) : '';
  });
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [accountError, setAccountError] = useState<string | null>(null);
  const onAccountChange = React.useCallback((v: string) => {
    setFundingAccountId(v);
    if (v) setAccountError(null);
  }, []);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedSupplier =
    supplier ?? (suppliers || []).find((s: any) => s.id === selectedSupplierId) ?? null;
  const owed = Number(resolvedSupplier?.currentBalance || 0);

  const onPickSupplier = (id: string) => {
    setSelectedSupplierId(id);
    const s = (suppliers || []).find((x: any) => x.id === id);
    const o = Number(s?.currentBalance || 0);
    setAmount(o > 0 ? o.toFixed(2) : '');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!stationId || !resolvedSupplier?.id) {
      setError('Choose the supplier.');
      return;
    }
    // The same field rules as the mobile sheet and the server (amount above 0 and
    // within the column, 2 decimals, the account, the reference length).
    const checked = supplierPaymentEntryFormSchema.safeParse({
      entryDate,
      supplierId: resolvedSupplier.id,
      amount: amount.trim() === '' ? undefined : amount.trim(),
      notes,
      fundingAccountId,
    });
    if (!checked.success) {
      const issues = checked.error.issues;
      const accountIssue = issues.find((i) => i.path[0] === 'fundingAccountId');
      const other = issues.find((i) => i.path[0] !== 'fundingAccountId');
      setAccountError(accountIssue?.message ?? null);
      setError(other?.message ?? (accountIssue ? null : 'Check the payment details.'));
      return;
    }
    setAccountError(null);
    const pendingKey = `${stationId}:${resolvedSupplier.id}`;
    const idempotencyKey = pendingKeys.get(pendingKey) ?? createIdempotencyKey();
    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordSupplierPayment(
        supplierPaymentPayload(stationId, checked.data),
        { idempotencyKey },
      );
      pendingKeys.delete(pendingKey);
      toast.success('Supplier payment recorded.');
      await invalidateOperational(stationId);
      onClose();
      await onDone?.();
    } catch (err: any) {
      // Unknown outcome: keep the key so a retry cannot pay twice. Decided: drop it.
      if (keepsIdempotencyKey(err)) pendingKeys.set(pendingKey, idempotencyKey);
      else pendingKeys.delete(pendingKey);
      setError(err.message || 'Failed to record supplier payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && (
        <div
          style={{
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {!supplier && (
        <Field label="Supplier" required>
          <Combobox
            options={(suppliers || []).map((s: any) => ({
              value: s.id,
              label: s.name,
              sublabel:
                Number(s.currentBalance || 0) > 0
                  ? `${inr(Number(s.currentBalance))} due`
                  : undefined,
            }))}
            value={selectedSupplierId}
            onChange={onPickSupplier}
            placeholder="Select supplier…"
            searchPlaceholder="Search suppliers…"
            disabled={submitting}
          />
        </Field>
      )}

      {resolvedSupplier && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface-alt)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            padding: '10px 12px',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            {resolvedSupplier.name}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Owed{' '}
            <strong
              style={{
                color: owed > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {inr(owed)}
            </strong>
          </span>
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

      <Field label="Entry date" required>
        <DateField
          max={today}
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <Field label="Paid from" required error={accountError ?? undefined}>
        <FundingAccountSelect
          types={SUPPLIER_PAYMENT_ACCOUNT_TYPES}
          stationId={stationId}
          value={fundingAccountId}
          onChange={onAccountChange}
          disabled={submitting}
          invalid={!!accountError}
        />
      </Field>

      <Field label="Payment ref / notes">
        <TextInput
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Cheque, RTGS ref…"
        />
      </Field>

      {Number(amount) > 0 && owed > 0 && Number(amount) < owed && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--brand-warning)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Partial — {inr(owed - Number(amount))} will remain outstanding.
        </span>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          disabled={!resolvedSupplier || !amount || Number(amount) <= 0}
        >
          Record Payment
        </Button>
        <Button type="button" variant="secondary" fullWidth disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Form>
  );
};
