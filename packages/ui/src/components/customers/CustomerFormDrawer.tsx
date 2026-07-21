import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerCreateSchema } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, MoneyInput, Textarea, Select } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface CustomerFormDrawerProps {
  isOpen: boolean;
  /** null = create, object = edit. */
  editingCustomer: any | null;
  stationId: string | null;
  onClose: () => void;
  /** Fired with the newly-created customer (create mode only), e.g. to auto-select it. */
  onCreated?: (customer: any) => void;
}

/**
 * Create / edit a customer profile. Self-contained: owns its React Hook Form
 * instance, resets from `editingCustomer` when opened, and performs the save +
 * cache invalidation + toast itself. The container only toggles `isOpen` and
 * passes the customer to edit (or null to create).
 */
export const CustomerFormDrawer: React.FC<CustomerFormDrawerProps> = ({ isOpen, editingCustomer, stationId, onClose, onCreated }) => {
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [drawerError, setDrawerError] = useState<string | null>(null);
  // Opening receivable at onboarding — local state (kept out of the shared zod
  // schema). Only offered on create for non-prepaid Credit/Fleet customers.
  const [openingDue, setOpeningDue] = useState('');
  const [openingAsOf, setOpeningAsOf] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name: '',
      phone: '',
      customerType: 'Regular' as const,
      creditLimit: 50000 as any,
      fleetCode: '',
      isPrepaid: false,
      settlementCycle: 'OPEN' as const,
      isActive: true,
      metadata: { gstin: '', pan: '', tradeName: '', billingAddress: '' },
    },
  });

  const custType = watch('customerType');
  const isPrepaid = watch('isPrepaid');

  useEffect(() => {
    if (!isOpen) return;
    setDrawerError(null);
    if (editingCustomer) {
      const meta = editingCustomer.metadata || {};
      reset({
        name: editingCustomer.name,
        phone: editingCustomer.phone || '',
        customerType: editingCustomer.customerType,
        creditLimit: editingCustomer.creditLimit ? Number(editingCustomer.creditLimit) : (editingCustomer.customerType === 'Regular' ? null : 50000) as any,
        fleetCode: editingCustomer.fleetCode || '',
        isPrepaid: Boolean(editingCustomer.isPrepaid),
        settlementCycle: editingCustomer.settlementCycle === 'EOD' ? 'EOD' : 'OPEN',
        isActive: editingCustomer.isActive,
        metadata: {
          gstin: meta.gstin || '',
          stateCode: meta.stateCode || '',
          pan: meta.pan || '',
          tradeName: meta.tradeName || '',
          billingAddress: meta.billingAddress || '',
        },
      });
    } else {
      reset({
        name: '',
        phone: '',
        customerType: 'Regular',
        creditLimit: 50000 as any,
        fleetCode: '',
        isPrepaid: false,
        settlementCycle: 'OPEN',
        isActive: true,
        metadata: { gstin: '', pan: '', tradeName: '', billingAddress: '' },
      });
    }
    setOpeningDue('');
    setOpeningAsOf('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingCustomer]);

  const onSubmit = async (data: any) => {
    setDrawerError(null);
    try {
      const payload = {
        name: data.name,
        phone: data.phone || null,
        customerType: data.customerType,
        creditLimit: (data.customerType === 'Credit' || data.customerType === 'Fleet') && data.creditLimit ? Number(data.creditLimit) : null,
        fleetCode: data.customerType === 'Fleet' ? data.fleetCode : null,
        isPrepaid: data.customerType === 'Fleet' ? Boolean(data.isPrepaid) : false,
        settlementCycle: (data.settlementCycle === 'EOD' ? 'EOD' : 'OPEN') as 'OPEN' | 'EOD',
        isActive: data.isActive,
        metadata: {
          gstin: data.metadata?.gstin || null,
          stateCode: data.metadata?.stateCode || null,
          pan: data.metadata?.pan || null,
          tradeName: data.metadata?.tradeName || null,
          billingAddress: data.metadata?.billingAddress || null,
        },
      };
      if (editingCustomer) {
        await transactionService.updateCustomer(editingCustomer.id, payload);
      } else {
        const created = await transactionService.createCustomer({
          ...payload,
          ...(Number(openingDue) > 0
            ? { openingDue: Number(openingDue), openingAsOf: openingAsOf || undefined, openingStationId: stationId || undefined }
            : {}),
        });
        onCreated?.(created);
      }
      invalidateOperational(stationId);
      toast.success(editingCustomer ? 'Customer updated.' : 'Customer created.');
      onClose();
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save customer');
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {drawerError && (
          <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
            {drawerError}
          </div>
        )}

        <Field label="Customer Name" required error={errors.name?.message}>
          <TextInput placeholder="e.g. KSRTC Depot, John Doe" {...register('name')} disabled={isSubmitting} invalid={!!errors.name} />
        </Field>

        <Field label="Phone Number" error={errors.phone?.message}>
          <TextInput placeholder="e.g. +91 9900…" {...register('phone')} disabled={isSubmitting} invalid={!!errors.phone} />
        </Field>

        <Field label="Account Type" required error={errors.customerType?.message}>
          <Select {...register('customerType')} disabled={isSubmitting} invalid={!!errors.customerType}>
            <option value="Regular">Regular (Cash/Card/UPI walk-in)</option>
            <option value="Credit">Credit (Standard outstanding account)</option>
            <option value="Fleet">Fleet (Requires fleet code authorization)</option>
          </Select>
        </Field>

        <Field label="Settlement Cycle" error={errors.settlementCycle?.message} hint="How on-account (Customer Sales) receivables are expected to clear.">
          <Select {...register('settlementCycle')} disabled={isSubmitting} invalid={!!errors.settlementCycle}>
            <option value="OPEN">Open (Running account, collected over time)</option>
            <option value="EOD">End of Day (Expected cleared by day close)</option>
          </Select>
        </Field>

        {(custType === 'Credit' || custType === 'Fleet') && (
          <Field label="Credit Limit" error={errors.creditLimit?.message}>
            <MoneyInput placeholder="50000" {...register('creditLimit', { valueAsNumber: true })} disabled={isSubmitting} invalid={!!errors.creditLimit} />
          </Field>
        )}

        {custType === 'Fleet' && (
          <Field label="Fleet Code / Card Reference" error={errors.fleetCode?.message}>
            <TextInput placeholder="e.g. FL-9923" {...register('fleetCode')} disabled={isSubmitting} invalid={!!errors.fleetCode} />
          </Field>
        )}

        {custType === 'Fleet' && (
          <Checkbox label="Enable Prepaid Wallet Mode" {...register('isPrepaid')} disabled={isSubmitting} />
        )}

        {!editingCustomer && (custType === 'Credit' || custType === 'Fleet') && !isPrepaid && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px', marginTop: '4px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 4px' }}>
              Opening Balance (Optional)
            </h4>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Amount this customer already owed before PumpOS. Recorded as an opening receivable (not a sale), so it counts toward their balance but stays out of sales &amp; P&amp;L.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="Opening Due (₹)">
                <TextInput type="number" min="0" step="0.01" placeholder="0" value={openingDue} onChange={(e) => setOpeningDue(e.target.value)} disabled={isSubmitting} />
              </Field>
              <Field label="As of Date" hint="Defaults to today">
                <TextInput type="date" value={openingAsOf} onChange={(e) => setOpeningAsOf(e.target.value)} disabled={isSubmitting} />
              </Field>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px', marginTop: '4px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px' }}>
            GST &amp; Tax Registration (Optional B2B)
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field label="GSTIN" error={errors.metadata?.gstin?.message}>
              <TextInput placeholder="15-digit GSTIN" {...register('metadata.gstin', { onChange: (e) => setValue('metadata.gstin', e.target.value.toUpperCase()) })} disabled={isSubmitting} invalid={!!errors.metadata?.gstin} />
            </Field>
            <Field label="State Code">
              <TextInput placeholder="e.g. 29" maxLength={2} {...register('metadata.stateCode')} disabled={isSubmitting} />
            </Field>
            <Field label="PAN" error={errors.metadata?.pan?.message}>
              <TextInput placeholder="10-digit PAN" {...register('metadata.pan', { onChange: (e) => setValue('metadata.pan', e.target.value.toUpperCase()) })} disabled={isSubmitting} invalid={!!errors.metadata?.pan} />
            </Field>
          </div>

          <Field label="Trade Name" error={errors.metadata?.tradeName?.message}>
            <TextInput placeholder="Business Trade Name" {...register('metadata.tradeName')} disabled={isSubmitting} invalid={!!errors.metadata?.tradeName} />
          </Field>

          <Field label="Billing Address" error={errors.metadata?.billingAddress?.message}>
            <Textarea placeholder="Full Billing Address" rows={2} {...register('metadata.billingAddress')} disabled={isSubmitting} invalid={!!errors.metadata?.billingAddress} />
          </Field>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          <Checkbox label="Account Active (Clear for operational logging)" {...register('isActive')} disabled={isSubmitting} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>Save Customer</Button>
          <Button type="button" variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  );
};
