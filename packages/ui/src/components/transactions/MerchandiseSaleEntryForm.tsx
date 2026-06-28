import React from 'react';
import type { ShiftOption } from './ExpenseEntryForm.js';

export interface MerchandiseSaleEntryFormProps {
  shiftOptions: ShiftOption[];
  targetShiftId: string;
  onTargetShiftIdChange: (value: string) => void;
  products: any[];
  productId: string;
  onProductIdChange: (value: string) => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unitPrice: string;
  onUnitPriceChange: (value: string) => void;
  paymentMethod: 'Cash' | 'Card' | 'UPI' | 'Credit';
  onPaymentMethodChange: (value: 'Cash' | 'Card' | 'UPI' | 'Credit') => void;
  customers: any[];
  customerId: string;
  onCustomerIdChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const inputStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  padding: '0 8px',
};

/**
 * Cash/Card/UPI/Credit sale of a non-fuel merchandise product (lubes, oils,
 * coolant, accessories). Anchored to the active shift (operator accountability);
 * decrements product stock via CreateSale. Credit requires a customer account.
 */
export const MerchandiseSaleEntryForm: React.FC<MerchandiseSaleEntryFormProps> = ({
  shiftOptions,
  targetShiftId,
  onTargetShiftIdChange,
  products,
  productId,
  onProductIdChange,
  quantity,
  onQuantityChange,
  unitPrice,
  onUnitPriceChange,
  paymentMethod,
  onPaymentMethodChange,
  customers,
  customerId,
  onCustomerIdChange,
  notes,
  onNotesChange,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;
  const qtyNum = Number(quantity) || 0;
  const priceNum = Number(unitPrice) || 0;
  const total = qtyNum * priceNum;
  const isCredit = paymentMethod === 'Credit';
  const selected = products.find((p) => p.id === productId);

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && (
        <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', fontWeight: 500 }}>
          {error}
        </div>
      )}

      {hasMultipleShiftOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
          <select value={targetShiftId} onChange={(e) => onTargetShiftIdChange(e.target.value)} disabled={submitting} style={inputStyle}>
            {shiftOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Product</label>
        {products.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            No non-fuel products found. Add merchandise products in Station Overview → Products first.
          </div>
        ) : (
          <select value={productId} onChange={(e) => onProductIdChange(e.target.value)} disabled={submitting} style={inputStyle}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code}){p.unit ? ` · ${p.unit}` : ''}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Quantity{selected?.unit ? ` (${selected.unit})` : ''}</label>
          <input type="number" step="any" required value={quantity} onChange={(e) => onQuantityChange(e.target.value)} disabled={submitting} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Unit Price (₹)</label>
          <input type="number" step="any" required value={unitPrice} onChange={(e) => onUnitPriceChange(e.target.value)} disabled={submitting} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Payment Method</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
          {(['Cash', 'Card', 'UPI', 'Credit'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPaymentMethodChange(m)}
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
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {isCredit ? 'Customer Account (Required for Credit)' : 'Customer Account (Optional)'}
        </label>
        <select value={customerId} onChange={(e) => onCustomerIdChange(e.target.value)} disabled={submitting} style={inputStyle}>
          <option value="">-- Walk-in / Cash Customer --</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customerType})</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes</label>
        <input type="text" value={notes} onChange={(e) => onNotesChange(e.target.value)} disabled={submitting} placeholder="Optional reference" style={inputStyle} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sale Total</span>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-strong)' }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="submit"
          className="btn btn-primary btn-md"
          style={{ flex: 1 }}
          disabled={submitting || !productId || !quantity || !unitPrice || (isCredit && !customerId)}
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
