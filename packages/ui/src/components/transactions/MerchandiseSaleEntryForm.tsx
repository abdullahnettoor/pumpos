import React from 'react';
import { cn } from '../../pump-ds/lib/cn.js';
import { useFieldArray } from 'react-hook-form';
import { merchandiseSaleEntryFormSchema, type MerchandiseSaleEntryFormValues } from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { Field, TextInput, NumberInput, Select } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button, Form, Icon, SegmentedControl } from '../../pump-ds/index.js';
import { inr, formatQty } from '../../utils/format.js';

export interface ShiftOption {
  id: string;
  label: string;
}

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
  lines: [
    {
      productId: '',
      quantity: undefined as unknown as number,
      unitPrice: undefined as unknown as number,
    },
  ],
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
  const rate =
    cat === 'GST'
      ? Number(product?.taxConfig?.gst_rate ?? 0)
      : cat === 'FUEL_VAT'
        ? Number(product?.taxConfig?.vat_rate ?? 0)
        : 0;
  const inclusive = product?.taxConfig?.price_inclusive !== false;
  const hasTax = rate > 0 && (cat === 'GST' || cat === 'FUEL_VAT');
  if (hasTax && inclusive) {
    const taxable = gross / (1 + rate / 100);
    return { taxable, tax: gross - taxable, total: gross, hasTax };
  }
  if (hasTax) {
    const tax = gross * (rate / 100);
    return { taxable: gross, tax, total: gross + tax, hasTax };
  }
  return { taxable: gross, tax: 0, total: gross, hasTax };
}

/**
 * Cash/Card/UPI/Credit sale of a non-fuel merchandise product (lubes, oils,
 * coolant, accessories). Anchored to the active shift (operator accountability);
 * decrements product stock via CreateSale. Credit requires a customer account.
 */
/**
 * Remounted when the defaults change rather than reset by an effect — the same
 * treatment as PurchaseEntryForm. The defaults are the form's *initial* values,
 * so mounting fresh says that directly, and there is no effect to keep honest.
 */
export const MerchandiseSaleEntryForm: React.FC<MerchandiseSaleEntryFormProps> = (props) => (
  <MerchandiseSaleEntryFormBody key={JSON.stringify(props.defaultValues ?? {})} {...props} />
);

const MerchandiseSaleEntryFormBody: React.FC<MerchandiseSaleEntryFormProps> = ({
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

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useZodForm<MerchandiseSaleEntryFormValues>(merchandiseSaleEntryFormSchema, {
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

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
    <Form onSubmit={handleSubmit((values) => onSubmit(values))} className="flex flex-col gap-3">
      {error && (
        <div className="rounded-input bg-danger-bg px-3 py-2.5 text-[12px] font-medium text-danger-fg">
          {error}
        </div>
      )}

      {hasMultipleShiftOptions && (
        <Field label="Target shift">
          <Select disabled={submitting} {...register('targetShiftId')}>
            {shiftOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {attendants && attendants.length > 0 && (
        <Field label="Sold by">
          <Select disabled={submitting} {...register('attendantId')}>
            {attendants.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.userName}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {products.length === 0 ? (
        <div className="py-1.5 text-[12px] text-warning-fg">
          No non-fuel products found. Add products in Station → Products first.
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-ink-muted">Items</label>
          <div className="flex flex-col gap-2.5">
            {fields.map((f, i) => {
              const line = watchedLines[i];
              const p = products.find((x) => x.id === line?.productId);
              const qty = Number(line?.quantity) || 0;
              const price = Number(line?.unitPrice) || 0;
              const t = p && qty > 0 ? lineTax(p, qty, price) : null;
              const stock =
                stockByProduct && line?.productId ? stockByProduct[line.productId] : undefined;
              const oversell = stock != null && qty > stock;
              return (
                <div
                  key={f.id}
                  className="flex flex-col gap-1.5 rounded-input border border-border-soft px-2.5 py-2"
                >
                  <Combobox
                    options={products.map((pr) => {
                      const onHand = stockByProduct ? stockByProduct[pr.id] : undefined;
                      const bits: string[] = [];
                      if (pr.sellingPrice != null) bits.push(`MRP ${inr(pr.sellingPrice)}`);
                      if (onHand != null)
                        bits.push(
                          `${formatQty(Number(onHand))}${pr.unit ? ` ${pr.unit}` : ''} on hand`,
                        );
                      return {
                        value: pr.id,
                        label: `${pr.name}${pr.brand ? ` · ${pr.brand}` : ''} (${pr.code})`,
                        sublabel: bits.length
                          ? bits.join(' · ')
                          : pr.unit
                            ? String(pr.unit)
                            : undefined,
                      };
                    })}
                    value={line?.productId ?? ''}
                    onChange={(v) => {
                      setValue(`lines.${i}.productId` as const, v, { shouldValidate: true });
                      const pr = products.find((x) => x.id === v);
                      setValue(
                        `lines.${i}.unitPrice` as const,
                        (pr?.sellingPrice != null
                          ? Number(pr.sellingPrice)
                          : undefined) as unknown as number,
                        { shouldValidate: true },
                      );
                    }}
                    placeholder="Select product…"
                    searchPlaceholder="Search products…"
                    invalid={!!errors.lines?.[i]?.productId}
                    disabled={submitting}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <NumberInput
                        placeholder={`Qty${p?.unit ? ` (${p.unit})` : ''}`}
                        disabled={submitting}
                        invalid={!!errors.lines?.[i]?.quantity || oversell}
                        {...register(`lines.${i}.quantity` as const)}
                      />
                    </div>
                    <div className="flex-1">
                      <NumberInput
                        placeholder="₹ Price"
                        disabled={submitting}
                        invalid={!!errors.lines?.[i]?.unitPrice}
                        {...register(`lines.${i}.unitPrice` as const)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      iconOnly
                      className="h-8.5"
                      disabled={submitting || fields.length <= 1}
                      onClick={() => remove(i)}
                      aria-label="Remove line"
                    >
                      <Icon name="trash" size="xs" />
                    </Button>
                  </div>
                  {t && (
                    <div className="pl-0.5 text-[12px] text-ink-faint">
                      {inr(t.taxable)}
                      {t.hasTax ? ` + tax ${inr(t.tax)}` : ''} = {inr(t.total)}
                    </div>
                  )}
                  {oversell && (
                    <div className="pl-0.5 text-[12px] text-warning-fg">
                      Only {formatQty(Number(stock))}
                      {p?.unit ? ` ${p.unit}` : ''} on hand — stock will go negative.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="plus" size="xs" />}
            className="mt-2"
            disabled={submitting}
            onClick={() =>
              append({
                productId: '',
                quantity: undefined as unknown as number,
                unitPrice: undefined as unknown as number,
              })
            }
          >
            Add item
          </Button>
          {typeof errors.lines?.message === 'string' && (
            <div className="mt-1 text-[12px] text-brand-danger">{errors.lines.message}</div>
          )}
        </div>
      )}

      <Field label="Payment method">
        <SegmentedControl
          stretch
          size="md"
          activeStyle="brand"
          options={[
            { value: 'Cash', label: 'Cash' },
            { value: 'Card', label: 'Card' },
            { value: 'UPI', label: 'UPI' },
            { value: 'Credit', label: 'Credit' },
          ]}
          value={paymentMethod}
          onChange={(v) => setValue('paymentMethod', v, { shouldValidate: true })}
          disabled={submitting}
          aria-label="Payment method"
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
        <div className="flex flex-col gap-2.5 rounded-input border border-border-soft px-3 py-2.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            Buyer details (optional)
          </span>
          <span className="-mt-1.5 text-[12px] text-ink-faint">
            For a walk-in not in your registry — used on the bill/invoice.
          </span>
          <Field label="Name">
            <TextInput placeholder="Buyer name" disabled={submitting} {...register('buyerName')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <TextInput placeholder="Phone" disabled={submitting} {...register('buyerPhone')} />
            </Field>
            <Field label="GSTIN">
              <TextInput placeholder="GSTIN" disabled={submitting} {...register('buyerGstin')} />
            </Field>
          </div>
          <Field label="State code">
            <TextInput
              placeholder="e.g. 32"
              disabled={submitting}
              {...register('buyerStateCode')}
            />
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

      <div className="flex flex-col gap-1 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5">
        {hasTax && (
          <>
            <div className="flex justify-between text-[12px] text-ink-muted">
              <span>Taxable</span>
              <span className="font-mono">{inr(taxableValue)}</span>
            </div>
            <div className="flex justify-between text-[12px] text-ink-muted">
              <span>Tax</span>
              <span className="font-mono">{inr(taxValue)}</span>
            </div>
          </>
        )}
        <div
          className={cn(
            'flex items-center justify-between',
            hasTax && 'border-t border-border-soft pt-1',
          )}
        >
          <span className="text-[12px] font-semibold text-ink-muted">Sale total</span>
          <strong className="font-mono text-[15px] text-ink-strong">{inr(grossTotal)}</strong>
        </div>
      </div>

      <div className="mt-1 flex gap-2">
        <Button type="submit" variant="primary" size="md" className="flex-1" loading={submitting}>
          {`Record ${isCredit ? 'Credit ' : ''}Sale`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </Form>
  );
};
