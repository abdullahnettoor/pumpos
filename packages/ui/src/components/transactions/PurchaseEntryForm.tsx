import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import {
  purchaseEntryFormSchemaFor,
  resolveBusinessDate,
  resolveEntryDate,
  type PurchaseEntryFormValues,
} from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { formatBusinessDate, inr } from '../../utils/format.js';
import { Field, TextInput, NumberInput, MoneyInput } from '../primitives/Field.js';
import { Combobox } from '../primitives/Combobox.js';
import { SUPPLIER_PAYMENT_ACCOUNT_TYPES } from '../../utils/fundingAccounts.js';
import type { PurchasePayNow } from '../../utils/officeRecordPayloads.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Button, Form, Icon, SegmentedControl } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { useBusinessDayStatus } from '../../query/hooks.js';
import { useOfficeRecordContext } from '../../office-records/context.js';
import {
  typedAmount,
  useReportDraft,
  type OfficeRecordFormProps,
} from '../../office-records/draft.js';
import { RecordDateField } from '../../office-records/fields/RecordDateField.js';
import { FundingAccountField } from '../../office-records/fields/FundingAccountField.js';
import { PartyField, type PartyOption } from '../../office-records/fields/PartyField.js';
import { OFFICE_RECORD_KINDS } from '../../office-records/kinds.js';

export type { PurchasePayNow };

/** One invoice is all fuel or all products, never both. */
export type PurchaseType = 'FUEL' | 'PRODUCTS';

export interface PurchaseEntryFormProps extends Partial<
  Pick<OfficeRecordFormProps<PurchaseEntryFormValues>, 'formId' | 'onDraftChange'>
> {
  suppliers: readonly PartyOption[];
  products: any[];
  defaultValues?: Partial<PurchaseEntryFormValues>;
  /** What the invoice is for, when the lines don't already say. Fuel by default. */
  defaultType?: PurchaseType;
  /** Opened from a supplier statement: the supplier is fixed. */
  lockedSupplier?: PartyOption | null;
  /** Inter-state supply (supplier state ≠ station state) → IGST instead of CGST+SGST. */
  interState?: boolean;
  onSubmit: (values: PurchaseEntryFormValues, payment?: PurchasePayNow) => void | Promise<void>;
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontWeight: 600,
};
const errorTextStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--brand-danger)' };

const emptyLine = () => ({
  productId: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
});

const isFuel = (p: any) => p?.productType === 'FUEL';

/**
 * A supplier invoice. Fuel is an Office Record dated by its invoice (an Entry
 * Date) that moves no stock — fuel stock comes from Decantation (ADR 0007).
 * Products are dated by their Business Date and add stock. "Also record a
 * supplier payment now" adds a separate Supplier payment, saved in the same
 * request as the purchase.
 *
 * Remounted when the defaults change rather than reset by an effect, keeping
 * field-array ids stable for per-line amount inputs.
 */
export const PurchaseEntryForm: React.FC<PurchaseEntryFormProps> = (props) => (
  <PurchaseEntryFormBody key={JSON.stringify(props.defaultValues ?? {})} {...props} />
);

const PurchaseEntryFormBody: React.FC<PurchaseEntryFormProps> = ({
  formId,
  suppliers,
  products,
  defaultValues,
  defaultType,
  lockedSupplier,
  interState = false,
  onDraftChange,
  onSubmit,
}) => {
  const ctx = useOfficeRecordContext();
  const { stationId, disabled } = ctx;
  const entryToday = ctx.today || resolveEntryDate();
  const businessToday = ctx.businessDate || resolveBusinessDate();
  const defaultDate = (t: PurchaseType) => (t === 'FUEL' ? entryToday : businessToday);

  // The fuel/product mix rule is part of the schema; it needs the catalogue.
  const schema = useMemo(
    () => purchaseEntryFormSchemaFor((id) => isFuel(products.find((p) => p.id === id))),
    [products],
  );

  const initialType: PurchaseType = (() => {
    const first = products.find((p) => p.id === defaultValues?.lines?.[0]?.productId);
    if (first) return isFuel(first) ? 'FUEL' : 'PRODUCTS';
    return defaultType ?? 'FUEL';
  })();
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(initialType);

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useZodForm<PurchaseEntryFormValues>(schema, {
    defaultValues: {
      transactionDate: defaultDate(initialType),
      supplierId: lockedSupplier?.id ?? '',
      invoiceNumber: '',
      notes: '',
      lines: [emptyLine()],
      ...defaultValues,
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' });

  const purchaseDate = watch('transactionDate') || '';
  const supplierId = watch('supplierId') || '';
  // Fuel lines are entered as an invoice TOTAL (tax-inclusive); ₹/L is derived.
  // Keyed by field-array row id.
  const [lineTotals, setLineTotals] = useState<Record<string, string>>({});

  // "Also record a supplier payment now": off by default.
  const [payNow, setPayNow] = useState(false);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const onPayAccountChange = useCallback((v: string) => {
    setPayAccountId(v);
    if (v) setPayError(null);
  }, []);

  // React Hook Form mutates the watched array in place, so its identity is
  // stable even as the values change — which makes it useless as a dependency.
  // Round-tripping through the signature gives the derivations below an
  // identity that changes exactly when the values do, and nothing else.
  const linesSignature = JSON.stringify(watch('lines') ?? []);
  const watchedLines = useMemo<Partial<PurchaseEntryFormValues['lines'][number]>[]>(
    () => JSON.parse(linesSignature),
    [linesSignature],
  );
  const isProducts = purchaseType === 'PRODUCTS';
  const dayStatusQ = useBusinessDayStatus(stationId, purchaseDate, {
    enabled: isProducts && !!stationId && !!purchaseDate,
  });
  const closedDate =
    isProducts && dayStatusQ.data?.requestedState === 'CLOSED' ? purchaseDate : null;

  // The rates the fuel lines *should* carry (total ÷ quantity), derived during
  // render; the effect only writes them into the form.
  const desiredFuelRates = useMemo(() => {
    const out: { path: `lines.${number}.unitPrice`; rate: number | undefined }[] = [];
    watchedLines.forEach((line, i) => {
      const fieldId = fields[i]?.id;
      const product = products.find((p) => p.id === line?.productId);
      if (!isFuel(product) || !fieldId) return;
      const total = Number(lineTotals[fieldId]);
      const qty = Number(line?.quantity);
      const rate = total > 0 && qty > 0 ? total / qty : 0;
      if (Math.abs(Number(line?.unitPrice || 0) - rate) > 1e-6)
        out.push({ path: `lines.${i}.unitPrice` as const, rate: rate || undefined });
    });
    return out;
  }, [watchedLines, fields, products, lineTotals]);

  useEffect(() => {
    for (const { path, rate } of desiredFuelRates) setValue(path, rate as unknown as number);
  }, [desiredFuelRates, setValue]);

  // ---- Invoice tax preview (client estimate; server is authoritative) ----
  // Only GST lines add tax on our side; fuel is recorded tax-inclusive.
  let taxableTotal = 0,
    gstTotal = 0,
    cessTotal = 0;
  for (const line of watchedLines) {
    const product = products.find((p) => p.id === line?.productId);
    const taxable = (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);
    taxableTotal += taxable;
    if (product?.taxCategory === 'GST') {
      gstTotal += (taxable * Number(product.taxConfig?.gst_rate || 0)) / 100;
      cessTotal += (taxable * Number(product.taxConfig?.cess || 0)) / 100;
    }
  }
  const grandTotal = taxableTotal + gstTotal + cessTotal;

  const visibleProducts = products.filter((p: any) => (isProducts ? !isFuel(p) : isFuel(p)));
  const paid = payNow ? (typedAmount(payAmount) ?? grandTotal) : null;

  useReportDraft(
    {
      date: purchaseDate,
      amount: grandTotal > 0 ? Math.round(grandTotal * 100) / 100 : null,
      partyId: supplierId || undefined,
      accountId: payNow ? payAccountId || undefined : undefined,
      blocked: !!closedDate,
      purchase: {
        type: purchaseType,
        payNow: paid,
        stockLines: isProducts
          ? watchedLines
              .filter((l) => l?.productId && Number(l.quantity) > 0)
              .map(
                (l) =>
                  `${Number(l.quantity)} × ${products.find((p) => p.id === l.productId)?.name ?? ''}`,
              )
          : [],
      },
    },
    onDraftChange ?? noop,
  );

  const switchType = (next: PurchaseType) => {
    if (next === purchaseType) return;
    // A product picked for the other type can't stay on this invoice.
    replace([emptyLine()]);
    setLineTotals({});
    // Keep a date the operator chose; move the default to the new type's.
    if (getValues('transactionDate') === defaultDate(purchaseType))
      setValue('transactionDate', defaultDate(next));
    setPurchaseType(next);
  };

  const submit = (values: PurchaseEntryFormValues) => {
    const lines = values.lines.map((ln, i) => {
      const fieldId = fields[i]?.id;
      const fuel = isFuel(products.find((p) => p.id === ln.productId));
      let unitPrice = Number(ln.unitPrice);
      if (fuel && fieldId) {
        const total = Number(lineTotals[fieldId]);
        const qty = Number(ln.quantity);
        if (total > 0 && qty > 0) unitPrice = total / qty;
      }
      return {
        ...ln,
        unitPrice,
        invoiceDensity: fuel && ln.invoiceDensity !== '' ? ln.invoiceDensity : undefined,
      };
    });
    if (closedDate) return;
    let payment: PurchasePayNow | undefined;
    if (payNow) {
      const amount = typedAmount(payAmount) ?? Math.round(grandTotal * 100) / 100;
      if (!payAccountId) {
        setPayError('Choose the account');
        return;
      }
      if (amount > 0) {
        payment = {
          amount,
          fundingAccountId: payAccountId,
          entryDate: values.transactionDate || entryToday,
        };
      }
    }
    return onSubmit({ ...values, lines }, payment);
  };

  const dateHint = isProducts
    ? 'Adds stock on this Business Day.'
    : 'A fuel purchase is dated by its invoice. Fuel stock comes from Decantation, not from here.';

  return (
    <Form id={formId} onSubmit={handleSubmit(submit)}>
      <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-0 border-0 p-0">
        <Field
          label="What was bought"
          required
          hint={`${isProducts ? 'Adds to Product stock when saved.' : 'Records the payable only. Stock moves when the tanker is decanted.'} One invoice can't mix fuel and products.`}
        >
          <SegmentedControl
            aria-label="What was bought"
            options={[
              { value: 'FUEL', label: 'Fuel' },
              { value: 'PRODUCTS', label: 'Products' },
            ]}
            value={purchaseType}
            disabled={disabled}
            onChange={switchType}
          />
        </Field>

        <RecordDateField
          name="transactionDate"
          label={isProducts ? 'Business date' : 'Invoice date'}
          value={purchaseDate}
          max={isProducts ? businessToday : entryToday}
          hint={dateHint}
          onChange={(v) => setValue('transactionDate', v)}
        />
        {closedDate && (
          <div className="mb-4">
            <Banner severity="warning" title={`${closedDate} is closed.`}>
              Its stock is sealed, so a product purchase cannot be recorded on it. Record this
              purchase on an open day.
            </Banner>
          </div>
        )}

        <PartyField
          party="supplier"
          options={suppliers}
          locked={lockedSupplier}
          value={supplierId}
          onChange={(v) => setValue('supplierId', v, { shouldValidate: true })}
          error={errors.supplierId?.message}
        />

        <Field label="Invoice no.">
          <TextInput placeholder="e.g. INV-10022" {...register('invoiceNumber')} />
        </Field>

        {/* Line items */}
        <div className="mb-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span style={labelStyle}>Invoice lines</span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              leftIcon={<Icon name="plus" size="xs" />}
              onClick={() => append(emptyLine())}
            >
              Add line
            </Button>
          </div>

          {fields.map((field, i) => {
            const line = watchedLines[i];
            const product = products.find((p) => p.id === line?.productId);
            const unitLabel = product?.unit || 'units';
            const fuel = isFuel(product);
            const isGst = product?.taxCategory === 'GST';
            const gstRate = Number(product?.taxConfig?.gst_rate || 0);
            const cessRate = Number(product?.taxConfig?.cess || 0);
            const qty = Number(line?.quantity) || 0;
            const rate = Number(line?.unitPrice) || 0;
            const taxable = qty * rate;
            const fuelTotal = lineTotals[field.id] || '';

            return (
              <div
                key={field.id}
                className="flex flex-col gap-2 rounded-input border border-border-soft bg-surface-alt p-2.5"
              >
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-[2] flex-col gap-1">
                    <label style={labelStyle}>Product</label>
                    <Combobox
                      options={visibleProducts.map((p: any) => ({
                        value: p.id,
                        label: `${p.name}${p.brand ? ` · ${p.brand}` : ''}${p.code ? ` (${p.code})` : ''}`,
                      }))}
                      value={line?.productId ?? ''}
                      onChange={(v) =>
                        setValue(`lines.${i}.productId` as const, v, { shouldValidate: true })
                      }
                      placeholder="Choose a product"
                      searchPlaceholder="Search products…"
                      invalid={!!errors.lines?.[i]?.productId}
                      disabled={disabled}
                    />
                    {errors.lines?.[i]?.productId && (
                      <span style={errorTextStyle}>{errors.lines[i]?.productId?.message}</span>
                    )}
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label="Remove line"
                      className="mt-5"
                      leftIcon={<Icon name="x" size="xs" />}
                      onClick={() => {
                        remove(i);
                        setLineTotals((prev) => {
                          const n = { ...prev };
                          delete n[field.id];
                          return n;
                        });
                      }}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label style={labelStyle}>{`Quantity (${unitLabel})`}</label>
                    <NumberInput
                      invalid={!!errors.lines?.[i]?.quantity}
                      {...register(`lines.${i}.quantity` as const)}
                    />
                    {errors.lines?.[i]?.quantity && (
                      <span style={errorTextStyle}>{errors.lines[i]?.quantity?.message}</span>
                    )}
                  </div>
                  {fuel ? (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Total Amount (₹)</label>
                      <NumberInput
                        value={fuelTotal}
                        onChange={(e) =>
                          setLineTotals((prev) => ({ ...prev, [field.id]: e.target.value }))
                        }
                      />
                      {errors.lines?.[i]?.unitPrice && !fuelTotal && (
                        <span style={errorTextStyle}>Total is required</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Rate (₹, pre-tax)</label>
                      <NumberInput
                        invalid={!!errors.lines?.[i]?.unitPrice}
                        {...register(`lines.${i}.unitPrice` as const)}
                      />
                      {errors.lines?.[i]?.unitPrice && (
                        <span style={errorTextStyle}>{errors.lines[i]?.unitPrice?.message}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-mono text-[11px] text-ink-muted">
                  <span>
                    {fuel
                      ? qty > 0 && rate > 0
                        ? `Derived: ₹${rate.toFixed(4)}/${unitLabel} · tax-incl.`
                        : 'Enter qty + total'
                      : isGst
                        ? `GST ${gstRate}%${cessRate ? ` + cess ${cessRate}%` : ''}`
                        : product
                          ? 'No tax'
                          : ''}
                  </span>
                  <span>{fuel ? `Cost: ${inr(taxable)}` : `Taxable: ${inr(taxable)}`}</span>
                </div>

                {fuel && (
                  <div className="flex flex-col gap-1.5 border-t border-border-soft pt-2">
                    <label style={labelStyle}>Invoice Density (kg/m³ @15 °C)</label>
                    <NumberInput
                      step="0.01"
                      placeholder="Optional"
                      {...register(`lines.${i}.invoiceDensity` as const)}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {(errors.lines?.root?.message ?? errors.lines?.message) && (
            <span role="alert" style={errorTextStyle}>
              {errors.lines?.root?.message ?? errors.lines?.message}
            </span>
          )}

          {/* Invoice totals */}
          <div className="flex flex-col gap-1 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 font-mono text-[12px]">
            <div className="flex justify-between text-ink-muted">
              <span>Taxable</span>
              <span>{inr(taxableTotal)}</span>
            </div>
            {gstTotal > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>{interState ? 'IGST' : 'CGST + SGST'}</span>
                <span>{inr(gstTotal)}</span>
              </div>
            )}
            {cessTotal > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Cess</span>
                <span>{inr(cessTotal)}</span>
              </div>
            )}
            <div className="mt-0.5 flex justify-between border-t border-border-soft pt-1 font-bold text-ink-strong">
              <span>Invoice total</span>
              <span>{inr(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-input border border-border-soft p-3">
          <Checkbox
            label="Also record a supplier payment now"
            description={`Saved as its own Supplier payment, dated ${purchaseDate ? formatBusinessDate(purchaseDate) : 'the purchase date'}. Leave off to pay later from Suppliers.`}
            checked={payNow}
            onChange={(e) => {
              const on = e.target.checked;
              setPayNow(on);
              if (on && !payAmount && grandTotal > 0) setPayAmount(grandTotal.toFixed(2));
            }}
          />
          {payNow && (
            <div className="mt-3">
              <FundingAccountField
                name={`${formId ?? 'purchase'}-pay-account`}
                value={payAccountId}
                onChange={onPayAccountChange}
                types={SUPPLIER_PAYMENT_ACCOUNT_TYPES}
                hint={OFFICE_RECORD_KINDS['supplier-payment'].accountHint}
                error={payError ?? undefined}
              />
              <Field
                label="Amount paid"
                required
                style={{ marginBottom: 0 }}
                hint={
                  typedAmount(payAmount) != null && grandTotal > 0 && Number(payAmount) < grandTotal
                    ? `Part payment: ${inr(grandTotal - Number(payAmount))} stays owed.`
                    : undefined
                }
              >
                <MoneyInput
                  aria-label="Amount paid"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <Field label="Notes">
          <TextInput placeholder="Anything the next reader should know" {...register('notes')} />
        </Field>
      </fieldset>
    </Form>
  );
};

const noop = () => {};
