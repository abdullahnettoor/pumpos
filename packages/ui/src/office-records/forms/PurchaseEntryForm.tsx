import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import {
  purchaseWithPayNowFormSchemaFor,
  type PurchaseEntryFormValues,
  type PurchaseWithPayNowFormValues,
} from '@pump/shared';
import { useZodForm } from '../../forms/useZodForm.js';
import { formatBusinessDate, inr } from '../../utils/format.js';
import { Field, TextInput, NumberInput, MoneyInput } from '../../components/primitives/Field.js';
import { Combobox } from '../../components/primitives/Combobox.js';
import { Checkbox } from '../../components/primitives/Toggle.js';
import { Banner } from '../../components/primitives/Banner.js';
import { SUPPLIER_PAYMENT_ACCOUNT_TYPES } from '../../utils/fundingAccounts.js';
import type { PurchasePayNow } from '../../utils/officeRecordPayloads.js';
import { Button, Form, Icon, SegmentedControl } from '../../pump-ds/index.js';
import { useBusinessDayStatus } from '../../query/hooks.js';
import { useOfficeRecordContext } from '../context.js';
import { typedAmount, useReportDraft, type OfficeRecordFormProps } from '../draft.js';
import { RecordDateField } from '../fields/RecordDateField.js';
import { FundingAccountField } from '../fields/FundingAccountField.js';
import { PartyField, type PartyOption } from '../fields/PartyField.js';
import { OFFICE_RECORD_KINDS } from '../kinds.js';
import { partPaymentText } from '../preview.js';

export type { PurchasePayNow };

/** One invoice is all fuel or all products, never both. */
export type PurchaseType = 'FUEL' | 'PRODUCTS';

/** The purchase form's values: the invoice plus what was bought and the pay-now payment. */
export type PurchaseFormValues = PurchaseWithPayNowFormValues;

export interface PurchaseEntryFormProps extends Partial<
  Pick<OfficeRecordFormProps<PurchaseFormValues>, 'formId' | 'onDraftChange'>
> {
  suppliers: readonly PartyOption[];
  products: any[];
  defaultValues?: Partial<PurchaseFormValues>;
  /** What the invoice is for, when the lines don't already say. Fuel by default. */
  defaultType?: PurchaseType;
  /** Opened from a supplier statement: the supplier is fixed. */
  lockedSupplier?: PartyOption | null;
  /** Inter-state supply (supplier state ≠ station state) → IGST instead of CGST+SGST. */
  interState?: boolean;
  onSubmit: (values: PurchaseFormValues, payment?: PurchasePayNow) => void | Promise<void>;
}

const LABEL = 'text-[12px] font-semibold text-ink-muted';
const ERROR = 'text-[12px] text-danger-fg';

const emptyLine = () => ({
  productId: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
});

const isFuel = (p: any) => p?.productType === 'FUEL';
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The pay-now Supplier payment's Entry Date, before the operator picks one:
 * the purchase's date. A product purchase on the current Business Day is dated
 * by its Business Date, which Day Start can hold on yesterday; its payment, an
 * Office Record, takes today's calendar date instead (ADR 0005).
 */
export function payNowDateFor(
  purchaseDate: string,
  type: PurchaseType,
  clock: { today: string; businessDate: string },
): string {
  if (type === 'PRODUCTS' && purchaseDate && purchaseDate === clock.businessDate)
    return clock.today;
  return purchaseDate;
}

/**
 * A supplier invoice. Fuel is an Office Record dated by its invoice (an Entry
 * Date) that moves no stock — fuel stock comes from Decantation (ADR 0007).
 * Products are dated by their Business Date and add stock. "Also record a
 * supplier payment now" adds a separate Supplier payment with its own Payment
 * date, saved in the same request as the purchase.
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
  const { stationId, disabled, today, businessDate } = useOfficeRecordContext();
  const clock = { today, businessDate };
  const defaultDate = (t: PurchaseType) => (t === 'FUEL' ? today : businessDate);

  // The fuel/product mix rule and the pay-now checks are part of the schema.
  const schema = useMemo(
    () => purchaseWithPayNowFormSchemaFor((id) => isFuel(products.find((p) => p.id === id)), today),
    [products, today],
  );

  const initialType: PurchaseType = (() => {
    if (defaultValues?.purchaseType) return defaultValues.purchaseType;
    const first = products.find((p) => p.id === defaultValues?.lines?.[0]?.productId);
    if (first) return isFuel(first) ? 'FUEL' : 'PRODUCTS';
    return defaultType ?? 'FUEL';
  })();
  const initialDate = defaultValues?.transactionDate || defaultDate(initialType);
  const initialPayDate = payNowDateFor(initialDate, initialType, clock);
  const carriedPayment = defaultValues?.payment;

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useZodForm<PurchaseFormValues>(schema, {
    defaultValues: {
      supplierId: lockedSupplier?.id ?? '',
      invoiceNumber: '',
      notes: '',
      lines: [emptyLine()],
      ...defaultValues,
      transactionDate: initialDate,
      purchaseType: initialType,
      payment: {
        enabled: false,
        fundingAccountId: '',
        amount: '',
        ...carriedPayment,
        entryDate: carriedPayment?.entryDate || initialPayDate,
      },
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' });

  const purchaseType = watch('purchaseType');
  const purchaseDate = watch('transactionDate') || '';
  const supplierId = watch('supplierId') || '';
  const payment = watch('payment');
  const payNow = payment.enabled;
  // Fuel lines are entered as an invoice TOTAL (tax-inclusive); ₹/L is derived.
  // Keyed by field-array row id.
  const [lineTotals, setLineTotals] = useState<Record<string, string>>({});
  // The payment date follows the purchase date, and the amount paid the
  // invoice total, until the operator changes them.
  const [payDateEdited, setPayDateEdited] = useState(
    !!carriedPayment?.entryDate && carriedPayment.entryDate !== initialPayDate,
  );
  const [payAmountEdited, setPayAmountEdited] = useState(false);
  const onPayAccountChange = useCallback(
    (v: string) => setValue('payment.fundingAccountId', v, { shouldValidate: !!v }),
    [setValue],
  );

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
  const invoiceTotal = round2(grandTotal);
  const paid = payNow ? typedAmount(payment.amount) : null;

  const followedPayDate = payNowDateFor(purchaseDate, purchaseType, clock);
  useEffect(() => {
    if (!payDateEdited && getValues('payment.entryDate') !== followedPayDate)
      setValue('payment.entryDate', followedPayDate);
  }, [payDateEdited, followedPayDate, getValues, setValue]);

  const followedPayAmount = invoiceTotal > 0 ? invoiceTotal.toFixed(2) : '';
  useEffect(() => {
    if (payNow && !payAmountEdited && getValues('payment.amount') !== followedPayAmount)
      setValue('payment.amount', followedPayAmount);
  }, [payNow, payAmountEdited, followedPayAmount, getValues, setValue]);

  useReportDraft(
    {
      date: purchaseDate,
      amount: invoiceTotal > 0 ? invoiceTotal : null,
      partyId: supplierId || undefined,
      accountId: payNow ? payment.fundingAccountId || undefined : undefined,
      blocked: !!closedDate,
      purchase: {
        type: purchaseType,
        payNow: paid,
        payDate: payNow ? payment.entryDate : undefined,
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
    setValue('purchaseType', next);
  };

  const submit = (values: PurchaseFormValues) => {
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
    const pay = values.payment;
    const payNowPayment: PurchasePayNow | undefined = pay.enabled
      ? {
          amount: Number(pay.amount),
          fundingAccountId: pay.fundingAccountId,
          entryDate: pay.entryDate,
        }
      : undefined;
    return onSubmit({ ...values, lines }, payNowPayment);
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
          max={(isProducts ? businessDate : today) || undefined}
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
            <span className={LABEL}>Invoice lines</span>
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
                    <label className={LABEL}>Product</label>
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
                      <span className={ERROR}>{errors.lines[i]?.productId?.message}</span>
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
                    <label className={LABEL}>{`Quantity (${unitLabel})`}</label>
                    <NumberInput
                      invalid={!!errors.lines?.[i]?.quantity}
                      {...register(`lines.${i}.quantity` as const)}
                    />
                    {errors.lines?.[i]?.quantity && (
                      <span className={ERROR}>{errors.lines[i]?.quantity?.message}</span>
                    )}
                  </div>
                  {fuel ? (
                    <div className="flex flex-col gap-1">
                      <label className={LABEL}>Total Amount (₹)</label>
                      <NumberInput
                        value={fuelTotal}
                        onChange={(e) =>
                          setLineTotals((prev) => ({ ...prev, [field.id]: e.target.value }))
                        }
                      />
                      {errors.lines?.[i]?.unitPrice && !fuelTotal && (
                        <span className={ERROR}>Total is required</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className={LABEL}>Rate (₹, pre-tax)</label>
                      <NumberInput
                        invalid={!!errors.lines?.[i]?.unitPrice}
                        {...register(`lines.${i}.unitPrice` as const)}
                      />
                      {errors.lines?.[i]?.unitPrice && (
                        <span className={ERROR}>{errors.lines[i]?.unitPrice?.message}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-mono text-[12px] text-ink-muted">
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
                    <label className={LABEL}>Invoice Density (kg/m³ @15 °C)</label>
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
            <span role="alert" className={ERROR}>
              {errors.lines?.root?.message ?? errors.lines?.message}
            </span>
          )}

          {/* Invoice totals */}
          <div className="flex flex-col gap-1 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 text-[12px]">
            <div className="flex justify-between text-ink-muted">
              <span>Taxable</span>
              <span className="font-mono tabular-nums">{inr(taxableTotal)}</span>
            </div>
            {gstTotal > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>{interState ? 'IGST' : 'CGST + SGST'}</span>
                <span className="font-mono tabular-nums">{inr(gstTotal)}</span>
              </div>
            )}
            {cessTotal > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Cess</span>
                <span className="font-mono tabular-nums">{inr(cessTotal)}</span>
              </div>
            )}
            <div className="mt-0.5 flex justify-between border-t border-border-soft pt-1 font-bold text-ink-strong">
              <span>Invoice total</span>
              <span className="font-mono tabular-nums">{inr(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-input border border-border-soft p-3">
          <Checkbox
            label="Also record a supplier payment now"
            description={`Saved as its own Supplier payment, dated ${payment.entryDate ? formatBusinessDate(payment.entryDate) : 'the payment date'}. Leave off to pay later from Suppliers.`}
            checked={payNow}
            onChange={(e) => setValue('payment.enabled', e.target.checked)}
          />
          {payNow && (
            <div className="mt-3">
              <FundingAccountField
                name={`${formId ?? 'purchase'}-pay-account`}
                value={payment.fundingAccountId ?? ''}
                onChange={onPayAccountChange}
                types={SUPPLIER_PAYMENT_ACCOUNT_TYPES}
                hint={OFFICE_RECORD_KINDS['supplier-payment'].accountHint}
                error={errors.payment?.fundingAccountId?.message}
              />
              <Field
                label="Amount paid"
                required
                error={errors.payment?.amount?.message}
                hint={partPaymentText(invoiceTotal, paid) ?? undefined}
              >
                <MoneyInput
                  aria-label="Amount paid"
                  step="0.01"
                  invalid={!!errors.payment?.amount}
                  value={String(payment.amount ?? '')}
                  onChange={(e) => {
                    setPayAmountEdited(true);
                    setValue('payment.amount', e.target.value, {
                      shouldValidate: !!errors.payment?.amount,
                    });
                  }}
                />
              </Field>
              <RecordDateField
                name="payment.entryDate"
                label="Payment date"
                value={payment.entryDate ?? ''}
                max={today || undefined}
                hint="The Supplier payment's Entry Date: its day in the Daily cash book."
                error={errors.payment?.entryDate?.message}
                onChange={(v) => {
                  setPayDateEdited(true);
                  setValue('payment.entryDate', v, { shouldValidate: true });
                }}
              />
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
