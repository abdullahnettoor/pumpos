import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { merchandiseSaleEntryFormSchema, type MerchandiseSaleEntryFormValues } from '@pump/shared';
import type { ShiftOption } from './ExpenseEntryForm.js';

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

const inputStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  padding: '0 8px',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 };
const errorTextStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--brand-danger)' };

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

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<MerchandiseSaleEntryFormValues>({
    resolver: zodResolver(merchandiseSaleEntryFormSchema) as any,
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const productId = watch('productId');
  const paymentMethod = watch('paymentMethod');
  const qtyNum = Number(watch('quantity')) || 0;
  const priceNum = Number(watch('unitPrice')) || 0;
  const total = qtyNum * priceNum;
  const isCredit = paymentMethod === 'Credit';
  const selected = products.find((p) => p.id === productId);
  const availableStock = stockByProduct && productId ? stockByProduct[productId] : undefined;
  const oversell = availableStock != null && qtyNum > availableStock;

  const productReg = register('productId');

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && (
        <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', fontWeight: 500 }}>
          {error}
        </div>
      )}

      {hasMultipleShiftOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Target Shift</label>
          <select disabled={submitting} style={inputStyle} {...register('targetShiftId')}>
            {shiftOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}

      {attendants && attendants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Sold by</label>
          <select disabled={submitting} style={inputStyle} {...register('attendantId')}>
            {attendants.map((a) => <option key={a.userId} value={a.userId}>{a.userName}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Product</label>
        {products.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            No non-fuel products found. Add merchandise products in Station Overview → Products first.
          </div>
        ) : (
          <select
            disabled={submitting}
            style={inputStyle}
            {...productReg}
            onChange={(e) => {
              productReg.onChange(e);
              const p = products.find((x) => x.id === e.target.value);
              setValue('unitPrice', (p?.sellingPrice != null ? Number(p.sellingPrice) : undefined) as unknown as number);
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''} ({p.code}){p.unit ? ` · ${p.unit}` : ''}</option>
            ))}
          </select>
        )}
        {errors.productId && <span style={errorTextStyle}>{errors.productId.message}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Quantity{selected?.unit ? ` (${selected.unit})` : ''}</label>
          <input type="number" step="any" disabled={submitting} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} {...register('quantity')} />
          {availableStock != null && (
            <span style={{ fontSize: '10px', color: oversell ? 'var(--brand-danger)' : 'var(--text-faint)' }}>
              On hand: {availableStock.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{selected?.unit ? ` ${selected.unit}` : ''}
            </span>
          )}
          {errors.quantity && <span style={errorTextStyle}>{errors.quantity.message}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Unit Price (₹)</label>
          <input type="number" step="any" disabled={submitting} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} {...register('unitPrice')} />
          {errors.unitPrice && <span style={errorTextStyle}>{errors.unitPrice.message}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Payment Method</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
          {(['Cash', 'Card', 'UPI', 'Credit'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setValue('paymentMethod', m, { shouldValidate: true })}
              disabled={submitting}
              style={{
                height: '32px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: paymentMethod === m ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                color: paymentMethod === m ? 'white' : 'var(--text-default)',
                border: paymentMethod === m ? 'none' : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>
          {isCredit ? 'Customer Account (Required for Credit)' : 'Customer Account (Optional)'}
        </label>
        <select disabled={submitting} style={inputStyle} {...register('customerId')}>
          <option value="">-- Walk-in / Cash Customer --</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customerType})</option>)}
        </select>
        {errors.customerId && <span style={errorTextStyle}>{errors.customerId.message}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Notes</label>
        <input type="text" placeholder="Optional reference" disabled={submitting} style={inputStyle} {...register('notes')} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sale Total</span>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-strong)' }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </div>

      {oversell && (
        <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          Selling {qtyNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })} but only {Number(availableStock).toLocaleString('en-IN', { maximumFractionDigits: 2 })} on hand — stock will go negative. Record a purchase or stock count to correct it.
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
