import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { CloudTransactionService } from '../../services/cloud.js';
import { useCustomers, useInvalidateOperational } from '../../query/hooks.js';
import { Button, Form, Panel, StatusChip } from '../../pump-ds/index.js';
import { Field, MoneyInput, Select, TextInput } from '../primitives/Field.js';
import { Banner } from '../primitives/Banner.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import { useRunTask } from '../../utils/runTask.js';

const transactionService = new CloudTransactionService();

interface ShiftTransactionsPanelProps {
  shiftId: string;
  /** Part of the save's fingerprint, so a key never crosses stations. */
  stationId?: string;
  onTransactionAdded?: () => void | Promise<unknown>;
  isReadOnly?: boolean;
}

interface CreditSaleBody {
  shiftId: string;
  stationId?: string;
  customerId: string;
  amount: number;
  notes?: string;
}

/**
 * Record a credit sale against a closed shift (#535). Only credit sales are
 * recorded here: expenses and collections are Office Records and purchases
 * anchor to the business day (ADR 0005, #308), so none belongs to a shift.
 * The save is keyed (`useKeyedSave`), so a retry after a dropped response
 * cannot record the sale twice.
 */
export const ShiftTransactionsPanel: React.FC<ShiftTransactionsPanelProps> = ({
  shiftId,
  stationId,
  onTransactionAdded,
  isReadOnly = false,
}) => {
  const invalidateOperational = useInvalidateOperational();
  const runTask = useRunTask();
  const save = useKeyedSave(`shift-credit-sale:${shiftId}`);
  const [error, setError] = useState<string | null>(null);

  const customersQ = useCustomers(true);
  const customers: any[] = customersQ.data ?? [];

  const [customerIdRaw, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  // Whatever the operator picked, else the first customer.
  const customerId = customerIdRaw || customers[0]?.id || '';

  const record = useMutation({
    mutationFn: (body: CreditSaleBody) =>
      save(body, (idempotencyKey) =>
        transactionService.recordCollection(
          {
            shiftId: body.shiftId,
            customerId: body.customerId,
            amount: body.amount,
            paymentMethod: 'Credit',
            notes: body.notes,
          },
          { idempotencyKey },
        ),
      ),
    // Synchronous (pump-data-caching rule 6): clear the form now; the refreshes
    // run in the background. A credit sale moves the customer's balance, the
    // shift and the day, so every operational key refreshes.
    onSuccess: () => {
      setAmount('');
      setNotes('');
      runTask(invalidateOperational(), 'Saved, but the screen could not be refreshed.');
      if (onTransactionAdded) {
        runTask(
          Promise.resolve(onTransactionAdded()),
          'Saved, but the screen could not be refreshed.',
        );
      }
    },
    onError: (err: unknown) => setError((err as Error)?.message || 'Failed to record credit sale'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !amount) return;
    if (!customerId) {
      setError('A customer account must be selected for Credit Sales.');
      return;
    }
    setError(null);
    record.mutate({
      shiftId,
      stationId,
      customerId,
      amount: Number(amount),
      notes: notes || undefined,
    });
  };

  const busy = isReadOnly || record.isPending;
  const loadError = customersQ.error ? 'Could not load customers. Reopen the page to retry.' : null;

  return (
    <Panel
      title="Record a credit sale"
      action={isReadOnly ? <StatusChip status="locked" size="sm" /> : undefined}
    >
      <p className="m-0 mb-3 text-[12px] text-ink-muted">
        Purchases, expenses and collections are not part of a shift — record them from Suppliers,
        Expenses or Customers.
      </p>
      {(error || loadError) && (
        <div className="mb-3">
          <Banner severity="danger">{error ?? loadError}</Banner>
        </div>
      )}
      <Form onSubmit={handleSubmit} className="flex max-w-[480px] flex-col">
        <Field label="Customer account" required>
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={busy || customersQ.isPending}
          >
            <option value="">
              {customersQ.isPending ? 'Loading customers…' : 'Select customer'}
            </option>
            {customers.map((cust) => (
              <option key={cust.id} value={cust.id}>
                {cust.name} ({cust.customerType})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" required>
          <MoneyInput
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            required
          />
        </Field>
        <Field label="Notes / fleet slip ID">
          <TextInput
            placeholder="e.g. Slip #9921"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
        </Field>
        <div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            leftIcon={<Plus size={13} />}
            loading={record.isPending}
            disabled={busy || !amount}
          >
            {record.isPending ? 'Recording…' : 'Log credit sale'}
          </Button>
        </div>
      </Form>
    </Panel>
  );
};
