import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { CloudTransactionService } from '../../services/cloud.js';
import { useCustomers, useInvalidateOperational } from '../../query/hooks.js';
import { z } from 'zod';
import { Button, DataSection, Form, Panel, StatusChip } from '../../pump-ds/index.js';
import { useZodForm } from '../../forms/useZodForm.js';
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

const creditSaleSchema = z.object({
  customerId: z.string(),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Enter an amount above zero'),
  notes: z.string().max(500).optional(),
});
type CreditSaleValues = z.infer<typeof creditSaleSchema>;

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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useZodForm<CreditSaleValues>(creditSaleSchema, {
    defaultValues: { customerId: '', amount: '', notes: '' },
  });
  // Whatever the operator picked, else the first customer.
  const customerId = watch('customerId') || customers[0]?.id || '';
  const amount = watch('amount');

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
      reset({ customerId: customerId, amount: '', notes: '' });
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

  const onSubmit = (values: CreditSaleValues) => {
    if (isReadOnly) return;
    if (!customerId) {
      setError('A customer account must be selected for Credit Sales.');
      return;
    }
    setError(null);
    record.mutate({
      shiftId,
      stationId,
      customerId,
      amount: Number(values.amount),
      notes: values.notes || undefined,
    });
  };

  const busy = isReadOnly || record.isPending;

  return (
    <Panel
      title="Record a credit sale"
      action={isReadOnly ? <StatusChip status="locked" size="sm" /> : undefined}
    >
      <p className="m-0 mb-3 text-[12px] text-ink-muted">
        Purchases, expenses and collections are not part of a shift — record them from Suppliers,
        Expenses or Customers.
      </p>
      {error && (
        <div className="mb-3">
          <Banner severity="danger">{error}</Banner>
        </div>
      )}
      <DataSection title="customers" query={customersQ} shape="bare" placeholderHeight={200}>
        <Form onSubmit={handleSubmit(onSubmit)} className="flex max-w-[480px] flex-col">
          <Field label="Customer account" required>
            <Select {...register('customerId')} value={customerId} disabled={busy}>
              <option value="">Select customer</option>
              {customers.map((cust) => (
                <option key={cust.id} value={cust.id}>
                  {cust.name} ({cust.customerType})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" required error={errors.amount?.message}>
            <MoneyInput
              step="0.01"
              placeholder="0.00"
              {...register('amount')}
              invalid={!!errors.amount}
              disabled={busy}
            />
          </Field>
          <Field label="Notes / fleet slip ID">
            <TextInput placeholder="e.g. Slip #9921" {...register('notes')} disabled={busy} />
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
      </DataSection>
    </Panel>
  );
};
