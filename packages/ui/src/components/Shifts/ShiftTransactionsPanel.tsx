import React, { useState } from 'react';
import { CloudTransactionService } from '../../services/cloud.js';
import { useCustomers, useInvalidateOperational } from '../../query/hooks.js';
import { Plus } from 'lucide-react';
import { Form } from '../../pump-ds/index.js';

const transactionService = new CloudTransactionService();

interface ShiftTransactionsPanelProps {
  shiftId: string;
  onTransactionAdded?: () => void | Promise<unknown>;
  isReadOnly?: boolean;
}

export const ShiftTransactionsPanel: React.FC<ShiftTransactionsPanelProps> = ({
  shiftId,
  onTransactionAdded,
  isReadOnly = false,
}) => {
  const invalidateOperational = useInvalidateOperational();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only credit sales are recorded here. Expenses and collections are Office
  // Records and purchases anchor to the business day (ADR 0005, #308): none
  // belongs to a shift, so each is recorded from its own screen.
  const customersQ = useCustomers(true);
  const customers: any[] = customersQ.data ?? [];
  const loading = customersQ.isPending;
  const loadError = customersQ.error;

  // Form state - credit sale (shift-anchored receivable)
  const [creditSaleCustomerIdRaw, setCreditSaleCustomerId] = useState('');
  const [creditSaleAmount, setCreditSaleAmount] = useState('');
  const [creditSaleNotes, setCreditSaleNotes] = useState('');
  // Whatever the operator picked, else the first customer.
  const creditSaleCustomerId = creditSaleCustomerIdRaw || customers[0]?.id || '';

  const handleAddCreditSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!creditSaleAmount) return;

    if (!creditSaleCustomerId) {
      setError('A customer account must be selected for Credit Sales.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordCollection({
        shiftId,
        customerId: creditSaleCustomerId || undefined,
        amount: Number(creditSaleAmount),
        paymentMethod: 'Credit',
        notes: creditSaleNotes || undefined,
      });

      // Clear form
      setCreditSaleAmount('');
      setCreditSaleNotes('');

      // A credit sale moves the customer's balance, the shift and the day, so
      // refresh every operational key, not just this shift's transactions.
      await invalidateOperational();
      await onTransactionAdded?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record credit sale');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading transactions console...
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: 'var(--bg-surface-alt)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Shift Transactions & Logbook
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Record credit sales against this shift. Purchases, expenses and collections are not
              part of a shift — record them from Purchases, Expenses or Customers.
            </p>
          </div>
          {isReadOnly && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-chip)',
              }}
            >
              Locked / Read-Only
            </span>
          )}
        </div>
      </div>

      {/* Main Panel Content */}
      <div style={{ padding: '20px', maxWidth: '480px' }}>
        <div>
          {(error || loadError) && (
            <div
              style={{
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                marginBottom: '16px',
                border: '1px solid var(--border-soft)',
              }}
            >
              {error ?? 'Could not load transaction settings. Reopen the panel to retry.'}
            </div>
          )}

          <Form
            onSubmit={handleAddCreditSale}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Record Shift Credit Sale
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Customer Account (Required)
              </label>
              <select
                value={creditSaleCustomerId}
                onChange={(e) => setCreditSaleCustomerId(e.target.value)}
                disabled={isReadOnly || submitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              >
                <option value="">-- Select customer --</option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} ({cust.customerType})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={creditSaleAmount}
                onChange={(e) => setCreditSaleAmount(e.target.value)}
                disabled={isReadOnly || submitting}
                required
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Notes / Fleet Slip ID
              </label>
              <input
                type="text"
                placeholder="e.g. Slip #9921, UPI txn ref, etc."
                value={creditSaleNotes}
                onChange={(e) => setCreditSaleNotes(e.target.value)}
                disabled={isReadOnly || submitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isReadOnly || submitting || !creditSaleAmount}
              style={{
                height: '36px',
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isReadOnly || submitting ? 'not-allowed' : 'pointer',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Plus size={14} /> {submitting ? 'Recording...' : 'Log Credit Sale'}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
};
