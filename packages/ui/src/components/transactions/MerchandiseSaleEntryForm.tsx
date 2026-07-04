import React, { useEffect } from 'react';
import { useFieldArray } from 'react-hook-form';
import { merchandiseSaleEntryFormSchema, type MerchandiseSaleEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import type { ShiftOption } from './ExpenseEntryForm.js';
import { Field, TextInput, NumberInput, Select } from '../primitives/Field.js';
import { Segmented } from '../primitives/Segmented.js';
import { Combobox } from '../primitives/Combobox.js';
import { Checkbox } from '../primitives/Toggle.js';
import { inr, formatQty } from '../../utils/format.js';
import { Plus, Trash2 } from 'lucide-react';

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
  paymentMethod: 'Cash',
  customerId: '',
  attendantId: '',
  notes: '',
  lines: [{ productId: '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }],
  buyerName: '',
  buyerPhone: '',
  buyerGstin: '',
  buyerStateCode: '',
  saveAsCustomer: false,
};

/** Per-line tax breakdown from a product's config (inclusive-aware). */
function lineTax(product: any, qty: number, price: number) {
  const gross = qty * price;
  const cat = product?.taxCategory || (product?.productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
  const rate = cat === 'GST' ? Number(product?.taxConfig?.gst_rate ?? 0) : cat === 'FUEL_VAT' ? Number(product?.taxConfig?.vat_rate ?? 0) : 0;
  const inclusive = product?.taxConfig?.price_inclusive !== false;
  const hasTax = rate > 0 && (cat === 'GST' || cat === 'FUEL_VAT');
  if (hasTax && inclusive) { const taxable = gross / (1 + rate / 100); return { taxable, tax: gross - taxable, total: gross, hasTax }; }
  if (hasTax) { const tax = gross * (rate / 100); return { taxable: gross, tax, total: gross + tax, hasTax }; }
  return { taxable: gross, tax: 0, total: gross, hasTax };
}

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

  const { register, handleSubmit, reset, watch, control, setValue, formState: { errors } } = useZodForm<MerchandiseSaleEntryFormValues>(merchandiseSaleEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const paymentMethod = watch('paymentMethod');
  const customerId = watch('customerId');
  const isCredit = paymentMethod === 'Credit';
  const watchedLines = watch('lines') || [];

  // Aggregate tax breakdown across all lines (each priced per its own config).
  let taxableValue = 0;
  let taxValue = 0;
  let grossTotal = 0;
  for (const l of watchedLines) {
    const p = products.find((x) => x.id === l?.productId);
    const qty = Number(l?.quantity) || 0;
    const price = Number(l?.unitPrice) || 0;
    if (!p || qty <= 0) continue;
    const t = lineTax(p, qty, price);
    taxableValue += t.taxable;
    taxValue += t.tax;
    grossTotal += t.total;
  }
  const hasTax = taxValue > 0;

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

      {products.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
          No non-fuel products found. Add merchandise products in Station Overview → Products first.
        </div>
      ) : (
        <div>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Items</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {fields.map((f, i) => {
              const line = watchedLines[i];
              const p = products.find((x) => x.id === line?.productId);
              const qty = Number(line?.quantity) || 0;
              const price = Number(line?.unitPrice) || 0;
              const t = p && qty > 0 ? lineTax(p, qty, price) : null;
              const stock = stockByProduct && line?.productId ? stockByProduct[line.productId] : undefined;
              const oversell = stock != null && qty > stock;
              return (
                <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '8px 10px' }}>
                  <Combobox
                    options={products.map((pr) => ({
                      value: pr.id,
                      label: `${pr.name}${pr.brand ? ` · ${pr.brand}` : ''} (${pr.code})`,
                      sublabel: pr.sellingPrice != null ? `MRP ${inr(pr.sellingPrice)}` : (pr.unit ? String(pr.unit) : undefined),
                    }))}
                    value={line?.productId ?? ''}
                    onChange={(v) => {
                      setValue(`lines.${i}.productId` as const, v, { shouldValidate: true });
                      const pr = products.find((x) => x.id === v);
                      setValue(`lines.${i}.unitPrice` as const, (pr?.sellingPrice != null ? Number(pr.sellingPrice) : undefined) as unknown as number, { shouldValidate: true });
                    }}
                    placeholder="Select product…"
                    searchPlaceholder="Search products…"
                    invalid={!!errors.lines?.[i]?.productId}
                    disabled={submitting}
                  />
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <NumberInput placeholder={`Qty${p?.unit ? ` (${p.unit})` : ''}`} disabled={submitting} invalid={!!errors.lines?.[i]?.quantity || oversell} {...register(`lines.${i}.quantity` as const)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <NumberInput placeholder="₹ Price" disabled={submitting} invalid={!!errors.lines?.[i]?.unitPrice} {...register(`lines.${i}.unitPrice` as const)} />
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '6px 8px', height: 34 }} disabled={submitting || fields.length <= 1} onClick={() => remove(i)} aria-label="Remove line"><Trash2 size={13} /></button>
                  </div>
                  {t && (
                    <div style={{ fontSize: '10px', color: 'var(--text-faint)', paddingLeft: '2px' }}>
                      {inr(t.taxable)}{t.hasTax ? ` + tax ${inr(t.tax)}` : ''} = {inr(t.total)}
                    </div>
                  )}
                  {oversell && (
                    <div style={{ fontSize: '11px', color: 'var(--brand-warning)', paddingLeft: '2px' }}>
                      Only {formatQty(Number(stock))}{p?.unit ? ` ${p.unit}` : ''} on hand — stock will go negative.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} disabled={submitting} onClick={() => append({ productId: '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number })}>
            <Plus size={13} /> Add item
          </button>
          {typeof errors.lines?.message === 'string' && (
            <div style={{ fontSize: '11px', color: 'var(--brand-danger)', marginTop: '4px' }}>{errors.lines.message}</div>
          )}
        </div>
      )}

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

      {!isCredit && !customerId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Buyer details (optional)</span>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '-6px' }}>For a walk-in not in your registry — used on the bill/invoice.</span>
          <Field label="Name">
            <TextInput placeholder="Buyer name" disabled={submitting} {...register('buyerName')} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Phone">
              <TextInput placeholder="Phone" disabled={submitting} {...register('buyerPhone')} />
            </Field>
            <Field label="GSTIN">
              <TextInput placeholder="GSTIN" disabled={submitting} {...register('buyerGstin')} />
            </Field>
          </div>
          <Field label="State Code">
            <TextInput placeholder="e.g. 32" disabled={submitting} {...register('buyerStateCode')} />
          </Field>
          <Checkbox
            label="Save as returning customer"
            description="Adds them to your customer registry (deduped by phone/GSTIN) and links this sale."
            disabled={submitting}
            {...register('saveAsCustomer')}
          />
        </div>
      )}

      <Field label="Notes">
        <TextInput placeholder="Optional reference" disabled={submitting} {...register('notes')} />
      </Field>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
        {hasTax && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Taxable</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(taxableValue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Tax</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(taxValue)}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: hasTax ? '1px solid var(--border-soft)' : 'none', paddingTop: hasTax ? '4px' : 0 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sale Total</span>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-strong)' }}>{inr(grossTotal)}</strong>
        </div>
      </div>

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
