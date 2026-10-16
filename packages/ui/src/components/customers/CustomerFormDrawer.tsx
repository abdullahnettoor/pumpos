import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { can, customerCreateSchema, principalOf, resolveEntryDate } from '@pump/shared';
import type { Role } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { Field, TextInput, MoneyInput, Textarea, Select } from '../primitives/Field.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button, DatePickerButton, Form } from '../../pump-ds/index.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { useInvalidateOperational, useStationTimeZone } from '../../query/hooks.js';
import { useToast } from '../primitives/ToastProvider.js';

const transactionService = new CloudTransactionService();

interface CustomerFormDrawerProps {
  isOpen: boolean;
  /** null = create, object = edit. */
  editingCustomer: any | null;
  stationId: string | null;
  onClose: () => void;
  /**
   * The signed-in user's Role. Editing a customer's credit limit is an Owner /
   * Manager right (`customers.changeCreditLimit`; the API refuses anyone else), so for
   * other Roles the limit field is shown but locked when editing. Unknown = not
   * locked (the API still decides).
   */
  userRole?: string;
  /** Fired with the newly-created customer (create mode only), e.g. to auto-select it. */
  onCreated?: (customer: any) => void;
}

/**
 * Create / edit a customer profile. Self-contained: owns its React Hook Form
 * instance, resets from `editingCustomer` when opened, and performs the save +
 * cache invalidation + toast itself. The container only toggles `isOpen` and
 * passes the customer to edit (or null to create).
 */
export const CustomerFormDrawer: React.FC<CustomerFormDrawerProps> = (props) =>
  props.isOpen ? <CustomerFormDrawerBody {...props} /> : null;

/**
 * Exists only while the drawer is open, so the customer being edited supplies
 * the form's *initial* values rather than being synced in by an effect. The key
 * covers what unmounting does not: switching record while the drawer stays open.
 */
const CustomerFormDrawerBody: React.FC<CustomerFormDrawerProps> = ({
  editingCustomer,
  stationId,
  onClose,
  onCreated,
  userRole,
}) => {
  const limitLocked =
    Boolean(editingCustomer) &&
    userRole !== undefined &&
    !can(principalOf(userRole), 'customers.changeCreditLimit');
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const [drawerError, setDrawerError] = useState<string | null>(null);
  // Opening receivable at onboarding — local state (kept out of the shared zod
  // schema). Only offered on create for non-prepaid Credit/Fleet customers.
  const [openingDue, setOpeningDue] = useState('');
  const [openingAsOf, setOpeningAsOf] = useState('');
  // An opening balance is dated by the station's calendar (Entry Date, ADR
  // 0005), never this device's.
  const timeZone = useStationTimeZone(stationId);
  const today = resolveEntryDate({ timeZone });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(customerCreateSchema),
    // The customer being edited supplies the initial values; a blank create
    // falls back per field, so the inferred form shape stays a single literal.
    defaultValues: {
      name: editingCustomer?.name ?? '',
      phone: editingCustomer?.phone || '',
      customerType: (editingCustomer?.customerType ?? 'Regular') as 'Regular',
      creditLimit: (editingCustomer
        ? editingCustomer.creditLimit
          ? Number(editingCustomer.creditLimit)
          : editingCustomer.customerType === 'Regular'
            ? null
            : 50000
        : 50000) as any,
      fleetCode: editingCustomer?.fleetCode || '',
      isPrepaid: Boolean(editingCustomer?.isPrepaid),
      settlementCycle: (editingCustomer?.settlementCycle === 'EOD' ? 'EOD' : 'OPEN') as 'OPEN',
      isActive: editingCustomer ? editingCustomer.isActive : true,
      metadata: {
        gstin: editingCustomer?.metadata?.gstin || '',
        pan: editingCustomer?.metadata?.pan || '',
        tradeName: editingCustomer?.metadata?.tradeName || '',
        billingAddress: editingCustomer?.metadata?.billingAddress || '',
        stateCode: editingCustomer?.metadata?.stateCode || '',
      },
    },
  });

  const custType = watch('customerType');
  const isPrepaid = watch('isPrepaid');

  const onSubmit = async (data: any) => {
    setDrawerError(null);
    try {
      // Annotated, not asserted: inside an object literal the ternary would widen
      // to `string` and stop matching the service's union. A named const keeps
      // the narrow type without a cast for the lint rule to call redundant.
      const settlementCycle: 'OPEN' | 'EOD' = data.settlementCycle === 'EOD' ? 'EOD' : 'OPEN';
      const payload = {
        name: data.name,
        phone: data.phone || null,
        customerType: data.customerType,
        // A locked limit is not sent at all: the server keeps what is stored.
        ...(limitLocked
          ? {}
          : {
              creditLimit:
                (data.customerType === 'Credit' || data.customerType === 'Fleet') &&
                data.creditLimit
                  ? Number(data.creditLimit)
                  : null,
            }),
        fleetCode: data.customerType === 'Fleet' ? data.fleetCode : null,
        isPrepaid: data.customerType === 'Fleet' ? Boolean(data.isPrepaid) : false,
        settlementCycle,
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
            ? {
                openingDue: Number(openingDue),
                openingAsOf: openingAsOf || undefined,
                openingStationId: stationId || undefined,
              }
            : {}),
        });
        onCreated?.(created);
      }
      toast.success(editingCustomer ? 'Customer updated.' : 'Customer created.');
      await invalidateOperational(stationId);
      onClose();
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save customer');
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={editingCustomer ? 'Edit customer profile' : 'Register new customer'}
    >
      <Form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {drawerError && (
          <div
            role="alert"
            className="rounded-input bg-danger-bg px-3 py-2 text-[12px] text-danger-fg"
          >
            {drawerError}
          </div>
        )}

        <Field label="Customer name" required error={errors.name?.message}>
          <TextInput
            placeholder="e.g. KSRTC Depot, John Doe"
            {...register('name')}
            disabled={isSubmitting}
            invalid={!!errors.name}
          />
        </Field>

        <Field label="Phone number" error={errors.phone?.message}>
          <TextInput
            placeholder="e.g. +91 9900…"
            {...register('phone')}
            disabled={isSubmitting}
            invalid={!!errors.phone}
          />
        </Field>

        <Field label="Account type" required error={errors.customerType?.message}>
          <Select
            {...register('customerType')}
            disabled={isSubmitting}
            invalid={!!errors.customerType}
          >
            <option value="Regular">Regular (Cash/Card/UPI walk-in)</option>
            <option value="Credit">Credit (Standard outstanding account)</option>
            <option value="Fleet">Fleet (Requires fleet code authorization)</option>
          </Select>
        </Field>

        <Field
          label="Settlement cycle"
          error={errors.settlementCycle?.message}
          hint="How on-account (Customer Sales) receivables are expected to clear."
        >
          <Select
            {...register('settlementCycle')}
            disabled={isSubmitting}
            invalid={!!errors.settlementCycle}
          >
            <option value="OPEN">Open (Running account, collected over time)</option>
            <option value="EOD">End of Day (Expected cleared by day close)</option>
          </Select>
        </Field>

        {(custType === 'Credit' || custType === 'Fleet') && (
          <Field
            label="Credit limit"
            error={errors.creditLimit?.message}
            hint={limitLocked ? 'Only an Owner or Manager can change the credit limit.' : undefined}
          >
            <MoneyInput
              placeholder="50000"
              {...register('creditLimit', { valueAsNumber: true })}
              disabled={isSubmitting || limitLocked}
              invalid={!!errors.creditLimit}
            />
          </Field>
        )}

        {custType === 'Fleet' && (
          <Field label="Fleet code / card reference" error={errors.fleetCode?.message}>
            <TextInput
              placeholder="e.g. FL-9923"
              {...register('fleetCode')}
              disabled={isSubmitting}
              invalid={!!errors.fleetCode}
            />
          </Field>
        )}

        {custType === 'Fleet' && (
          <Checkbox
            label="Enable prepaid wallet mode"
            {...register('isPrepaid')}
            disabled={isSubmitting}
          />
        )}

        {!editingCustomer && (custType === 'Credit' || custType === 'Fleet') && !isPrepaid && (
          <div className="mt-1 border-t border-border-soft pt-3">
            <h4 className="mb-1 text-[12px] font-semibold text-ink-strong">
              Opening balance (optional)
            </h4>
            <p className="mb-3 text-[12px] text-ink-muted">
              Amount this customer already owed before PumpOS. Recorded as an opening receivable
              (not a sale), so it counts toward their balance but stays out of sales &amp; P&amp;L.{' '}
              <strong>Enter carefully — it can’t be edited later</strong> (correct it with a ledger
              adjustment instead).
            </p>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Opening due (₹)">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={openingDue}
                  onChange={(e) => setOpeningDue(e.target.value)}
                  disabled={isSubmitting}
                />
              </Field>
              <Field label="As of Date" hint="Defaults to today">
                <DatePickerButton
                  variant="field"
                  aria-label="Opening due as of"
                  value={openingAsOf}
                  onChange={setOpeningAsOf}
                  max={today}
                  disabled={isSubmitting}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="mt-1 border-t border-border-soft pt-3">
          <h4 className="mb-3 text-[12px] font-semibold text-ink-strong">
            GST &amp; tax registration (optional B2B)
          </h4>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="GSTIN" error={errors.metadata?.gstin?.message}>
              <TextInput
                placeholder="15-digit GSTIN"
                {...register('metadata.gstin', {
                  onChange: (e) => setValue('metadata.gstin', e.target.value.toUpperCase()),
                })}
                disabled={isSubmitting}
                invalid={!!errors.metadata?.gstin}
              />
            </Field>
            <Field label="State code">
              <TextInput
                placeholder="e.g. 29"
                maxLength={2}
                {...register('metadata.stateCode')}
                disabled={isSubmitting}
              />
            </Field>
            <Field label="PAN" error={errors.metadata?.pan?.message}>
              <TextInput
                placeholder="10-digit PAN"
                {...register('metadata.pan', {
                  onChange: (e) => setValue('metadata.pan', e.target.value.toUpperCase()),
                })}
                disabled={isSubmitting}
                invalid={!!errors.metadata?.pan}
              />
            </Field>
          </div>

          <Field label="Trade name" error={errors.metadata?.tradeName?.message}>
            <TextInput
              placeholder="Business trade name"
              {...register('metadata.tradeName')}
              disabled={isSubmitting}
              invalid={!!errors.metadata?.tradeName}
            />
          </Field>

          <Field label="Billing address" error={errors.metadata?.billingAddress?.message}>
            <Textarea
              placeholder="Full billing address"
              rows={2}
              {...register('metadata.billingAddress')}
              disabled={isSubmitting}
              invalid={!!errors.metadata?.billingAddress}
            />
          </Field>
        </div>

        <div className="mt-1 flex flex-col gap-2.5">
          <Checkbox
            label="Account active (clear for operational logging)"
            {...register('isActive')}
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-2 flex gap-2.5">
          <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
            Save customer
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </Form>
    </Drawer>
  );
};
