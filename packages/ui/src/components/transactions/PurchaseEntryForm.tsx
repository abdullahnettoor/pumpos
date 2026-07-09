import React, { useEffect, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { purchaseEntryFormSchema, type PurchaseEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { inr } from '../../utils/format.js';
import { Field, TextInput, NumberInput, Select, DateField } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';

export interface ShiftOption {
  id: string;
  label: string;
}

export interface PurchaseEntryFormProps {
  shiftOptions: ShiftOption[];
  suppliers: any[];
  products: any[];
  /** All station tanks; the form filters to each line's product tanks. */
  tanks: any[];
  defaultValues?: Partial<PurchaseEntryFormValues>;
  submitting: boolean;
  error?: string | null;
  /** Inter-state supply (supplier state ≠ station state) → IGST instead of CGST+SGST. */
  interState?: boolean;
  onCancel: () => void;
  onSubmit: (values: PurchaseEntryFormValues) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  invoiceLabel?: string;
  invoicePlaceholder?: string;
  notesPlaceholder?: string;
  supplierEmptyMessage?: string;
  showShiftHintWhenSingle?: boolean;
  showDateField?: boolean;
  dateLabel?: string;
}

const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 };
const errorTextStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--brand-danger)' };

const EMPTY_DEFAULTS: PurchaseEntryFormValues = {
  targetShiftId: '',
  transactionDate: '',
  supplierId: '',
  invoiceNumber: '',
  notes: '',
  lines: [{ productId: '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }],
};

export const PurchaseEntryForm: React.FC<PurchaseEntryFormProps> = ({
  shiftOptions,
  suppliers,
  products,
  tanks,
  defaultValues,
  submitting,
  error,
  interState = false,
  onCancel,
  onSubmit,
  submitLabel = 'Add Purchase',
  submittingLabel = 'Saving...',
  invoiceLabel = 'Invoice Number',
  invoicePlaceholder,
  notesPlaceholder,
  supplierEmptyMessage = 'No active suppliers found. Please add or enable suppliers in the Supplier Registry tab.',
  showShiftHintWhenSingle = true,
  showDateField = false,
  dateLabel = 'Purchase Date',
}) => {
  const hasMultipleShiftOptions = shiftOptions.length > 1;

  const { register, handleSubmit, reset, watch, control, setValue, formState: { errors } } = useZodForm<PurchaseEntryFormValues>(purchaseEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // Tank allocations per line, keyed by the field-array row id then tankId.
  const [allocations, setAllocations] = useState<Record<string, Record<string, string>>>({});
  const [allocError, setAllocError] = useState<string | null>(null);
  // Fuel lines are entered as an invoice TOTAL (tax-inclusive); ₹/L is derived.
  // Keyed by field-array row id.
  const [lineTotals, setLineTotals] = useState<Record<string, string>>({});

  const serializedDefaults = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    reset({ ...EMPTY_DEFAULTS, ...defaultValues });
    setAllocations({});
    setLineTotals({});
    setAllocError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedDefaults]);

  const watchedLines = watch('lines') || [];

  // Fuel lines: derive unit price (₹/L) = total ÷ quantity, keeping the entered
  // total fixed as quantity changes.
  useEffect(() => {
    watchedLines.forEach((line: any, i: number) => {
      const fieldId = fields[i]?.id;
      const product = products.find((p) => p.id === line?.productId);
      if (product?.productType === 'FUEL' && fieldId) {
        const total = Number(lineTotals[fieldId]);
        const qty = Number(line?.quantity);
        const rate = total > 0 && qty > 0 ? total / qty : 0;
        if (Math.abs(Number(line?.unitPrice || 0) - rate) > 1e-6) {
          setValue(`lines.${i}.unitPrice` as const, (rate || undefined) as unknown as number);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedLines.map((l: any) => ({ p: l?.productId, q: l?.quantity }))), JSON.stringify(lineTotals)]);

  // Auto-fill allocation for a single-tank fuel line; clear non-fuel lines.
  useEffect(() => {
    setAllocations((prev) => {
      const next = { ...prev };
      let changed = false;
      fields.forEach((f, i) => {
        const line = watchedLines[i];
        const product = products.find((p) => p.id === line?.productId);
        const isFuel = product?.productType === 'FUEL';
        const productTanks = tanks.filter((t) => t.productId === line?.productId);
        if (!isFuel) {
          if (next[f.id] && Object.keys(next[f.id]).length) { delete next[f.id]; changed = true; }
        } else if (productTanks.length === 1 && line?.quantity) {
          const desired = { [productTanks[0].id]: String(line.quantity) };
          if (JSON.stringify(next[f.id]) !== JSON.stringify(desired)) { next[f.id] = desired; changed = true; }
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedLines.map((l: any) => ({ p: l?.productId, q: l?.quantity }))), fields.length]);

  // ---- Invoice tax preview (client estimate; server is authoritative) ----
  // Only GST lines add tax on our side; fuel is recorded tax-inclusive.
  let taxableTotal = 0, gstTotal = 0, cessTotal = 0;
  for (const line of watchedLines) {
    const product = products.find((p) => p.id === line?.productId);
    const taxable = (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);
    taxableTotal += taxable;
    if (product?.taxCategory === 'GST') {
      const rate = Number(product.taxConfig?.gst_rate || 0);
      const cess = Number(product.taxConfig?.cess || 0);
      gstTotal += (taxable * rate) / 100;
      cessTotal += (taxable * cess) / 100;
    }
  }
  const grandTotal = taxableTotal + gstTotal + cessTotal;

  const submit = (values: PurchaseEntryFormValues) => {
    setAllocError(null);
    const lines = values.lines.map((ln, i) => {
      const fieldId = fields[i]?.id;
      const product = products.find((p) => p.id === ln.productId);
      const isFuel = product?.productType === 'FUEL';
      let unitPrice = Number(ln.unitPrice);
      if (isFuel && fieldId) {
        const total = Number(lineTotals[fieldId]);
        const qty = Number(ln.quantity);
        if (total > 0 && qty > 0) unitPrice = total / qty;
      }
      const productTanks = tanks.filter((t) => t.productId === ln.productId);
      let tankAllocations: { tankId: string; quantity: number }[] | undefined;
      if (isFuel && productTanks.length > 0) {
        const alloc = (fieldId && allocations[fieldId]) || {};
        tankAllocations = productTanks
          .map((t) => ({ tankId: t.id, quantity: Number(alloc[t.id] || 0) }))
          .filter((a) => a.quantity > 0);
        const allocated = tankAllocations.reduce((s, a) => s + a.quantity, 0);
        if (Math.abs(allocated - Number(ln.quantity)) >= 0.01) {
          setAllocError(`Tank allocation for ${product?.name ?? 'fuel'} (${allocated.toFixed(2)}L) must equal the line quantity (${Number(ln.quantity).toFixed(2)}L).`);
          throw new Error('allocation-mismatch');
        }
      }
      return { ...ln, unitPrice, tankAllocations };
    });
    return onSubmit({ ...values, lines });
  };

  return (
    <form
      onSubmit={(e) => { handleSubmit(submit)(e).catch(() => { /* allocation mismatch surfaced via allocError */ }); }}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {showDateField && (
        <Field label={dateLabel}>
          <DateField disabled={submitting} {...register('transactionDate')} />
        </Field>
      )}
      {hasMultipleShiftOptions ? (
        <Field label="Target Shift">
          <Select disabled={submitting} {...register('targetShiftId')}>
            {shiftOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </Select>
        </Field>
      ) : showShiftHintWhenSingle && shiftOptions.length === 1 ? (
        <div style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
          Logging to shift: <strong>{shiftOptions[0].label}</strong>
        </div>
      ) : null}

      <Field label="Supplier" error={errors.supplierId?.message}>
        {suppliers.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>{supplierEmptyMessage}</div>
        ) : (
          <Combobox
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
              sublabel: supplier.metadata?.gstin ? String(supplier.metadata.gstin) : undefined,
            }))}
            value={watch('supplierId') ?? ''}
            onChange={(v) => setValue('supplierId', v, { shouldValidate: true })}
            placeholder="Select supplier…"
            searchPlaceholder="Search suppliers…"
            invalid={!!errors.supplierId}
            disabled={submitting}
          />
        )}
      </Field>

      {/* Line items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={labelStyle}>Line Items</label>
          <button type="button" className="btn btn-secondary btn-sm" disabled={submitting}
            onClick={() => append({ productId: '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number })}>
            + Add line
          </button>
        </div>

        {fields.map((field, i) => {
          const line = watchedLines[i];
          const product = products.find((p) => p.id === line?.productId);
          const unitLabel = product?.unit || 'units';
          const isFuel = product?.productType === 'FUEL';
          const isGst = product?.taxCategory === 'GST';
          const gstRate = Number(product?.taxConfig?.gst_rate || 0);
          const cessRate = Number(product?.taxConfig?.cess || 0);
          const productTanks = tanks.filter((t) => t.productId === line?.productId);
          const qty = Number(line?.quantity) || 0;
          const rate = Number(line?.unitPrice) || 0;
          const taxable = qty * rate;
          const fuelTotal = lineTotals[field.id] || '';
          const alloc = allocations[field.id] || {};
          const allocated = productTanks.reduce((s, tk) => s + (Number(alloc[tk.id]) || 0), 0);
          const allocMismatch = isFuel && productTanks.length > 1 && Math.abs(allocated - qty) >= 0.01;

          return (
            <div key={field.id} style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'var(--bg-surface-alt)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                  <label style={labelStyle}>Product</label>
                  <Combobox
                    options={[
                      { value: '', label: '-- Select --' },
                      ...products.map((p) => ({
                        value: p.id,
                        label: `${p.name}${p.brand ? ` · ${p.brand}` : ''}${p.code ? ` (${p.code})` : ''}`,
                      })),
                    ]}
                    value={line?.productId ?? ''}
                    onChange={(v) => setValue(`lines.${i}.productId` as const, v, { shouldValidate: true })}
                    placeholder="Select product…"
                    searchPlaceholder="Search products…"
                    invalid={!!errors.lines?.[i]?.productId}
                    disabled={submitting}
                  />
                  {errors.lines?.[i]?.productId && <span style={errorTextStyle}>{errors.lines[i]?.productId?.message}</span>}
                </div>
                {fields.length > 1 && (
                  <button type="button" title="Remove line" disabled={submitting}
                    onClick={() => { remove(i); setAllocations((prev) => { const n = { ...prev }; delete n[field.id]; return n; }); setLineTotals((prev) => { const n = { ...prev }; delete n[field.id]; return n; }); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--brand-danger)', cursor: 'pointer', fontSize: '14px', marginTop: '20px' }}>✕</button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={labelStyle}>{`Quantity (${unitLabel})`}</label>
                  <NumberInput disabled={submitting} invalid={!!errors.lines?.[i]?.quantity} {...register(`lines.${i}.quantity` as const)} />
                  {errors.lines?.[i]?.quantity && <span style={errorTextStyle}>{errors.lines[i]?.quantity?.message}</span>}
                </div>
                {isFuel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={labelStyle}>Total Amount (₹)</label>
                    <NumberInput disabled={submitting}
                      value={fuelTotal}
                      onChange={(e) => setLineTotals((prev) => ({ ...prev, [field.id]: e.target.value }))} />
                    {errors.lines?.[i]?.unitPrice && !fuelTotal && <span style={errorTextStyle}>Total is required</span>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={labelStyle}>Rate (₹, pre-tax)</label>
                    <NumberInput disabled={submitting} invalid={!!errors.lines?.[i]?.unitPrice} {...register(`lines.${i}.unitPrice` as const)} />
                    {errors.lines?.[i]?.unitPrice && <span style={errorTextStyle}>{errors.lines[i]?.unitPrice?.message}</span>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span>
                  {isFuel
                    ? (qty > 0 && rate > 0 ? `Derived: ₹${rate.toFixed(4)}/${unitLabel} · tax-incl.` : 'Enter qty + total')
                    : isGst ? `GST ${gstRate}%${cessRate ? ` + cess ${cessRate}%` : ''}` : product ? 'No tax' : ''}
                </span>
                <span>{isFuel ? `Cost: ${inr(taxable)}` : `Taxable: ${inr(taxable)}`}</span>
              </div>

              {isFuel && productTanks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-soft)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-strong)', fontWeight: 600 }}>Tank Drop Allocation</span>
                  {productTanks.map((tank) => (
                    <div key={tank.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {tank.name}{tank.capacity ? ` (Cap: ${Number(tank.capacity).toLocaleString('en-IN')}L)` : ''}
                      </span>
                      <input type="number" min="0" placeholder="0.00" disabled={submitting}
                        value={alloc[tank.id] || ''}
                        onChange={(e) => setAllocations((prev) => ({ ...prev, [field.id]: { ...(prev[field.id] || {}), [tank.id]: e.target.value } }))}
                        style={{ height: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', padding: '0 8px', textAlign: 'right', fontSize: '12px' }} />
                    </div>
                  ))}
                  {productTanks.length > 1 && (
                    <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', color: allocMismatch ? 'var(--brand-danger)' : 'var(--brand-success)' }}>
                      <span>Allocated: {allocated.toFixed(2)} / {qty.toFixed(2)} L</span>
                      {allocMismatch && <span style={{ fontWeight: 600 }}>Must equal line quantity</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {typeof errors.lines?.message === 'string' && <span style={errorTextStyle}>{errors.lines.message}</span>}
      </div>

      {/* Invoice totals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Taxable</span><span>{inr(taxableTotal)}</span></div>
        {gstTotal > 0 && (
          interState
            ? <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>IGST</span><span>{inr(gstTotal)}</span></div>
            : <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>CGST + SGST</span><span>{inr(gstTotal)}</span></div>
        )}
        {cessTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Cess</span><span>{inr(cessTotal)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-strong)', borderTop: '1px solid var(--border-soft)', paddingTop: '4px', marginTop: '2px' }}>
          <span>Invoice Total</span><span>{inr(grandTotal)}</span>
        </div>
      </div>

      <Field label={invoiceLabel}>
        <TextInput placeholder={invoicePlaceholder} disabled={submitting} {...register('invoiceNumber')} />
      </Field>

      <Field label="Notes">
        <TextInput placeholder={notesPlaceholder} disabled={submitting} {...register('notes')} />
      </Field>

      {(allocError || error) && (
        <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px', border: '1px solid var(--border-soft)' }}>
          {allocError || error}
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
