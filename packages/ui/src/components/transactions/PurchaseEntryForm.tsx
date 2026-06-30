import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchaseEntryFormSchema, type PurchaseEntryFormValues } from '@pump/shared';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface PurchaseEntryFormProps {
  shiftOptions: ShiftOption[];
  suppliers: any[];
  products: any[];
  /** All station tanks; the form filters to the selected product's tanks. */
  tanks: any[];
  defaultValues?: Partial<PurchaseEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: PurchaseEntryFormValues, allocations: Record<string, string>) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  totalAmountLabel?: string;
  productLabel?: string;
  invoiceLabel?: string;
  invoicePlaceholder?: string;
  notesPlaceholder?: string;
  supplierEmptyMessage?: string;
  showShiftHintWhenSingle?: boolean;
  showDerivedUnitPrice?: boolean;
  showDateField?: boolean;
  dateLabel?: string;
}

const fieldStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  padding: '0 8px',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 };
const errorTextStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--brand-danger)' };

const EMPTY_DEFAULTS: PurchaseEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  supplierId: '',
  productId: '',
  quantity: undefined as unknown as number,
  totalAmount: undefined as unknown as number,
  invoiceNumber: '',
  notes: '',
};

export const PurchaseEntryForm: React.FC<PurchaseEntryFormProps> = ({
  shiftOptions,
  suppliers,
  products,
  tanks,
  defaultValues,
  submitting,
  error,
  onCancel,
  onSubmit,
  submitLabel = 'Add Purchase',
  submittingLabel = 'Saving...',
  totalAmountLabel = 'Amount (INR)',
  productLabel = 'Product',
  invoiceLabel = 'Invoice Number',
  invoicePlaceholder,
  notesPlaceholder,
  supplierEmptyMessage = 'No active suppliers found. Please add or enable suppliers in the Supplier Registry tab.',
  showShiftHintWhenSingle = true,
  showDerivedUnitPrice = true,
  showDateField = false,
  dateLabel = 'Purchase Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PurchaseEntryFormValues>({
    resolver: zodResolver(purchaseEntryFormSchema) as any,
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    setAllocations({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const productId = watch('productId');
  const quantity = watch('quantity');
  const totalAmount = watch('totalAmount');

  const selectedFormProduct = products.find((p) => p.id === productId);
  const unitLabel = selectedFormProduct?.unit || 'units';
  const isFuel = selectedFormProduct?.productType === 'FUEL';
  const productTanks = tanks.filter((tank) => tank.productId === productId);

  // Auto-fill allocation for a single-tank fuel product; clear for non-fuel.
  useEffect(() => {
    if (isFuel && productTanks.length === 1 && quantity) {
      setAllocations({ [productTanks[0].id]: String(quantity) });
    } else if (!isFuel) {
      setAllocations({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFuel, productId, quantity, productTanks.length]);

  const allocatedTotal = Object.values(allocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const quantityNum = Number(quantity || 0);
  const hasAllocationMismatch = Math.abs(allocatedTotal - quantityNum) >= 0.01;
  const showDerivedPrice = showDerivedUnitPrice && Number(quantity) > 0 && Number(totalAmount) > 0;

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values, allocations))} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {showDateField && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{dateLabel}</label>
          <input type="date" disabled={submitting} style={fieldStyle} {...register('transactionDate')} />
        </div>
      )}
      {hasMultipleShiftOptions ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Target Shift</label>
          <select disabled={submitting} style={fieldStyle} {...register('targetShiftId')}>
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
        <label style={labelStyle}>Supplier</label>
        {suppliers.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
            {supplierEmptyMessage}
          </div>
        ) : (
          <select disabled={submitting} style={fieldStyle} {...register('supplierId')}>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} {supplier.metadata?.gstin ? `(${supplier.metadata.gstin})` : ''}
              </option>
            ))}
          </select>
        )}
        {errors.supplierId && <span style={errorTextStyle}>{errors.supplierId.message}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{productLabel}</label>
        <select disabled={submitting} style={fieldStyle} {...register('productId')}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.name}{product.brand ? ` · ${product.brand}` : ''}{product.code ? ` (${product.code})` : ''}</option>
          ))}
        </select>
        {errors.productId && <span style={errorTextStyle}>{errors.productId.message}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{`Quantity (${unitLabel})`}</label>
          <input type="number" step="any" disabled={submitting} style={fieldStyle} {...register('quantity')} />
          {errors.quantity && <span style={errorTextStyle}>{errors.quantity.message}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>{totalAmountLabel}</label>
          <input type="number" step="any" disabled={submitting} style={fieldStyle} {...register('totalAmount')} />
          {errors.totalAmount && <span style={errorTextStyle}>{errors.totalAmount.message}</span>}
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
                onChange={(e) => setAllocations({ ...allocations, [tank.id]: e.target.value })}
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
          <span>Derived Unit Price:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
            ₹{(Number(totalAmount) / Number(quantity)).toFixed(4)}/{unitLabel}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>{invoiceLabel}</label>
        <input type="text" placeholder={invoicePlaceholder} disabled={submitting} style={fieldStyle} {...register('invoiceNumber')} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Notes</label>
        <input type="text" placeholder={notesPlaceholder} disabled={submitting} style={fieldStyle} {...register('notes')} />
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
        <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
};
