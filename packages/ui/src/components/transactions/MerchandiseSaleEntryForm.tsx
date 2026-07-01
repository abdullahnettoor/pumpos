import React, { useEffect } from 'react';
import { merchandiseSaleEntryFormSchema, type MerchandiseSaleEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import type { ShiftOption } from './ExpenseEntryForm.js';
import { Field, TextInput, NumberInput, Select } from '../primitives/Field.js';
import { Segmented } from '../primitives/Segmented.js';
import { Combobox } from '../primitives/Combobox.js';
import { inr, formatQty } from '../../utils/format.js';

export interface MerchandiseSaleEntryFormProps {
  shiftOptions: ShiftOption[];
  products: any[];
  customers: any[];
  /** Shift attendants (operators) for attribution. When provided, an attendant
   * selector is shown and the chosen attendant is credited with the sale. */
  attendants?: { userId: string; userName: string }[];
  /** On-hand quantity keyed by productId, used to surface oversell warnings. */
  stockByProduct?: Record<string, number>;
  defaultValues?: Partial<MerchandiseSaleEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: MerchandiseSaleEntryFormValues) => void | Promise<void>;
}

const EMPTY_DEFAULTS: MerchandiseSaleEntryFormValues = {
  targetShiftId: '',
  productId: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
  paymentMethod: 'Cash',
  customerId: '',
  attendantId: '',
  notes: '',
};

/**
 * Cash/Card/UPI/Credit sale of a non-fuel merchandise product (lubes, oils,
 * coolant, accessories). Anchored to the active shift (operator accountability);
 * decrements product stock via CreateSale. Credit requires a customer account.
 */
export const MerchandiseSaleEntryForm: React.FC<MerchandiseSaleEntryFormProps> = ({
  shiftOptions,
  products,
  customers,
  attendants,
  stockByProduct,
  defaultValues,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useZodForm<MerchandiseSaleEntryFormValues>(merchandiseSaleEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const productId = watch('productId');
  const paymentMethod = watch('paymentMethod');
  const customerId = watch('customerId');
  const qtyNum = Number(watch('quantity')) || 0;
  const priceNum = Number(watch('unitPrice')) || 0;
  const total = qtyNum * priceNum;
  const isCredit = paymentMethod === 'Credit';
  const selected = products.find((p) => p.id === productId);
  const availableStock = stockByProduct && productId ? stockByProduct[productId] : undefined;
  const oversell = availableStock != null && qtyNum > availableStock;

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && (
        <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', fontWeight: 500 }}>
          {error}
        </div>
      )}

      {hasMultipleShiftOptions && (
        <Field label="Target Shift">
          <Select disabled={submitting} {...register('targetShiftId')}>
            {shiftOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      )}

      {attendants && attendants.length > 0 && (
        <Field label="Sold by">
          <Select disabled={submitting} {...register('attendantId')}>
            {attendants.map((a) => <option key={a.userId} value={a.userId}>{a.userName}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Product" error={errors.productId?.message}>
        {products.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            No non-fuel products found. Add merchandise products in Station Overview → Products first.
          </div>
        ) : (
          <Combobox
            options={products.map((p) => ({
              value: p.id,
              label: `${p.name}${p.brand ? ` · ${p.brand}` : ''} (${p.code})`,
              sublabel: p.unit ? String(p.unit) : undefined,
            }))}
            value={productId ?? ''}
            onChange={(v) => {
              setValue('productId', v, { shouldValidate: true });
              const p = products.find((x) => x.id === v);
              setValue('unitPrice', (p?.sellingPrice != null ? Number(p.sellingPrice) : undefined) as unknown as number);
            }}
            placeholder="Select product…"
            searchPlaceholder="Search products…"
            invalid={!!errors.productId}
            disabled={submitting}
          />
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field
          label={`Quantity${selected?.unit ? ` (${selected.unit})` : ''}`}
          error={errors.quantity?.message}
          hint={availableStock != null ? `On hand: ${formatQty(availableStock)}${selected?.unit ? ` ${selected.unit}` : ''}` : undefined}
        >
          <NumberInput disabled={submitting} invalid={!!errors.quantity || oversell} {...register('quantity')} />
        </Field>
        <Field label="Unit Price (₹)" error={errors.unitPrice?.message}>
          <NumberInput disabled={submitting} invalid={!!errors.unitPrice} {...register('unitPrice')} />
        </Field>
      </div>

      <Field label="Payment Method">
        <Segmented
          options={[
            { value: 'Cash', label: 'Cash' },
            { value: 'Card', label: 'Card' },
            { value: 'UPI', label: 'UPI' },
            { value: 'Credit', label: 'Credit' },
          ]}
          value={paymentMethod}
          onChange={(v) => setValue('paymentMethod', v as typeof paymentMethod, { shouldValidate: true })}
          disabled={submitting}
          aria-label="Payment Method"
        />
      </Field>

      <Field
        label={isCredit ? 'Customer Account (Required for Credit)' : 'Customer Account (Optional)'}
        error={errors.customerId?.message}
      >
        <Combobox
          options={[
            { value: '', label: '-- Walk-in / Cash Customer --' },
            ...customers.map((c) => ({ value: c.id, label: `${c.name} (${c.customerType})` })),
          ]}
          value={customerId ?? ''}
          onChange={(v) => setValue('customerId', v, { shouldValidate: true })}
          placeholder="Walk-in / Cash Customer"
          searchPlaceholder="Search customers…"
          invalid={!!errors.customerId}
          disabled={submitting}
        />
      </Field>

      <Field label="Notes">
        <TextInput placeholder="Optional reference" disabled={submitting} {...register('notes')} />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sale Total</span>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-strong)' }}>{inr(total)}</strong>
      </div>

      {oversell && (
        <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          Selling {formatQty(qtyNum)} but only {formatQty(Number(availableStock))} on hand — stock will go negative. Record a purchase or stock count to correct it.
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="submit"
          className="btn btn-primary btn-md"
          style={{ flex: 1 }}
          disabled={submitting}
        >
          {submitting ? 'Recording...' : `Record ${isCredit ? 'Credit ' : ''}Sale`}
        </button>
        <button type="button" className="btn btn-secondary btn-md" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
};
