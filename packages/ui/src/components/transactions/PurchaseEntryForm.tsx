import React from 'react';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface PurchaseEntryFormProps {
  shiftOptions: ShiftOption[];
  targetShiftId: string;
  onTargetShiftIdChange: (value: string) => void;
  supplierId: string;
  onSupplierIdChange: (value: string) => void;
  suppliers: any[];
  productId: string;
  onProductIdChange: (value: string) => void;
  products: any[];
  quantity: string;
  onQuantityChange: (value: string) => void;
  totalAmount: string;
  onTotalAmountChange: (value: string) => void;
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  isFuel: boolean;
  productTanks: any[];
  allocations: Record<string, string>;
  onAllocationsChange: (next: Record<string, string>) => void;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel?: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
  quantityLabel?: string;
  totalAmountLabel?: string;
  productLabel?: string;
  invoiceLabel?: string;
  invoicePlaceholder?: string;
  notesPlaceholder?: string;
  supplierEmptyMessage?: string;
  showShiftHintWhenSingle?: boolean;
  showDerivedUnitPrice?: boolean;
}

export const PurchaseEntryForm: React.FC<PurchaseEntryFormProps> = ({
  shiftOptions,
  targetShiftId,
  onTargetShiftIdChange,
  supplierId,
  onSupplierIdChange,
  suppliers,
  productId,
  onProductIdChange,
  products,
  quantity,
  onQuantityChange,
  totalAmount,
  onTotalAmountChange,
  invoiceNumber,
  onInvoiceNumberChange,
  notes,
  onNotesChange,
  isFuel,
  productTanks,
  allocations,
  onAllocationsChange,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Add Purchase',
  submittingLabel = 'Saving...',
  submitDisabled,
  quantityLabel = 'Quantity',
  totalAmountLabel = 'Amount (INR)',
  productLabel = 'Product',
  invoiceLabel = 'Invoice Number',
  invoicePlaceholder,
  notesPlaceholder,
  supplierEmptyMessage = 'No active suppliers found. Please add or enable suppliers in the Supplier Registry tab.',
  showShiftHintWhenSingle = true,
  showDerivedUnitPrice = true,
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;
  const allocatedTotal = Object.values(allocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const quantityNum = Number(quantity || 0);
  const hasAllocationMismatch = Math.abs(allocatedTotal - quantityNum) >= 0.01;
  const showDerivedPrice = showDerivedUnitPrice && Number(quantity) > 0 && Number(totalAmount) > 0;

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {hasMultipleShiftOptions ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
          <select
            value={targetShiftId}
            onChange={(e) => onTargetShiftIdChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
            {shiftOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      ) : showShiftHintWhenSingle && shiftOptions.length === 1 ? (
        <div style={{
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          padding: '10px 12px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
        }}>
          Logging to shift: <strong>{shiftOptions[0].label}</strong>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Supplier</label>
        {suppliers.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {supplierEmptyMessage}
          </div>
        ) : (
          <select
            value={supplierId}
            onChange={(e) => onSupplierIdChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} {supplier.metadata?.gstin ? `(${supplier.metadata.gstin})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{productLabel}</label>
        <select
          value={productId}
          onChange={(e) => onProductIdChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.name}{product.code ? ` (${product.code})` : ''}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{quantityLabel}</label>
          <input
            type="number"
            required
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{totalAmountLabel}</label>
          <input
            type="number"
            required
            value={totalAmount}
            onChange={(e) => onTotalAmountChange(e.target.value)}
            disabled={submitting}
            style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
          />
        </div>
      </div>

      {isFuel && productTanks.length > 0 && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          padding: '12px',
          borderRadius: 'var(--radius-input)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-strong)', fontWeight: 600 }}>Tank Drop Allocation</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Split the total invoice quantity across the destination tanks.</span>
          {productTanks.map((tank) => (
            <div key={tank.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {tank.name}{tank.capacity ? ` (Cap: ${Number(tank.capacity).toLocaleString('en-IN')}L)` : ''}
              </span>
              <input
                type="number"
                placeholder="0.00"
                value={allocations[tank.id] || ''}
                onChange={(e) => onAllocationsChange({ ...allocations, [tank.id]: e.target.value })}
                disabled={submitting}
                style={{ height: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px', textAlign: 'right', fontSize: '12px' }}
              />
            </div>
          ))}

          {productTanks.length > 1 && (
            <div style={{
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--border-soft)',
              paddingTop: '6px',
              marginTop: '4px',
              color: hasAllocationMismatch ? 'var(--brand-danger)' : 'var(--brand-success)'
            }}>
              <span>Allocated: {allocatedTotal.toFixed(2)} / {quantityNum.toFixed(2)} L</span>
              {hasAllocationMismatch && <span style={{ fontWeight: 600 }}>Sum must equal total quantity</span>}
            </div>
          )}
        </div>
      )}

      {showDerivedPrice && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-surface-alt)',
          padding: '6px 10px',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)'
        }}>
          <span>Derived Price per Litre:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            ₹{(Number(totalAmount) / Number(quantity)).toFixed(4)}/L
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{invoiceLabel}</label>
        <input
          type="text"
          placeholder={invoicePlaceholder}
          value={invoiceNumber}
          onChange={(e) => onInvoiceNumberChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes</label>
        <input
          type="text"
          placeholder={notesPlaceholder}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={submitting}
          style={{ height: '32px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px' }}
        />
      </div>

      {error && (
        <div style={{
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
          border: '1px solid var(--border-soft)'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button type="button" onClick={onCancel} disabled={submitting} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={submitDisabled ?? (submitting || !quantity || !totalAmount)} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
