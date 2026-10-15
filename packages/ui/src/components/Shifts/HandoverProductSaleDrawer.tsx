import React, { useMemo } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button, DataSection, Form, Icon, type SectionQuery } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { Combobox } from '../primitives/Combobox.js';
import { Field, MoneyInput, NumberInput, Select } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useZodForm } from '../../forms/useZodForm.js';
import { useKeyedSave } from '../../office-records/useKeyedSave.js';
import {
  useInventoryItems,
  useProducts,
  useRecordHandoverProductSale,
  useUsers,
} from '../../query/hooks.js';
import { formatMoney, formatQuantity } from '../../utils/format.js';
import {
  cashToDrawer,
  draftTotals,
  handoverProductSaleSchema,
  lineTax,
  saleLines,
  type DraftLine,
  type HandoverProductSaleFormValues,
  type PricedProduct,
} from './handoverProductSale.js';

/** A Handover Product Sale as listed for the shift (with its lines). */
export interface HandoverSaleRecord {
  id: string;
  attendantId?: string | null;
  nonCashAmount?: number | string | null;
  items?: { productId: string; quantity: number | string }[] | null;
}

/** A Billed Sale as listed for the shift. */
export interface BilledSaleRecord {
  id: string;
  attendantId?: string | null;
  customerName?: string | null;
  paymentMethod?: string | null;
  totalAmount: number | string;
  items?: { productName?: string | null; quantity: number | string }[] | null;
}

interface ProductOption extends PricedProduct {
  id: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  productType?: string | null;
}

interface UserOption {
  id: string;
  fullName?: string | null;
  email?: string | null;
  status?: string | null;
}

export interface HandoverProductSaleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  shiftId: string;
  stationId: string | null;
  /** The employee the drawer opens for; null to pick one. */
  employeeId: string | null;
  handoverSales: HandoverSaleRecord[];
  billed: BilledSaleRecord[];
}

const BLANK: DraftLine = { productId: '', quantity: '' };

/** The form for an employee: their recorded sale's lines, or a blank sheet. */
function draftFor(
  employeeId: string,
  sales: HandoverSaleRecord[],
): { editingId: string | null; values: HandoverProductSaleFormValues } {
  const existing = employeeId ? sales.find((h) => h.attendantId === employeeId) : undefined;
  if (!existing) {
    return { editingId: null, values: { attendantId: employeeId, lines: [BLANK], nonCash: '' } };
  }
  const lines = (existing.items ?? []).map((it) => ({
    productId: it.productId,
    quantity: String(Number(it.quantity)),
  }));
  return {
    editingId: existing.id,
    values: {
      attendantId: employeeId,
      lines: lines.length > 0 ? lines : [BLANK],
      nonCash: Number(existing.nonCashAmount) ? String(Number(existing.nonCashAmount)) : '',
    },
  };
}

/**
 * Record or edit an employee's Handover Product Sale (#533): the non-fuel
 * items they sold during the shift that were not billed one by one. One per
 * employee per shift; picking an employee who already has one opens it for
 * editing, never a second sale. Their Billed Sales are listed read-only for the
 * full picture.
 *
 * The products, employees and stock it picks from load in a Data Section
 * (skeleton, "Couldn't load … · Retry"), so the pickers are never silently
 * empty. Mount it fresh on every open (a `key`): each open is one save, sent
 * with one Idempotency-Key.
 */
export const HandoverProductSaleDrawer: React.FC<HandoverProductSaleDrawerProps> = (props) => {
  const { isOpen, onClose, stationId } = props;
  const productsQ = useProducts({ enabled: isOpen });
  const usersQ = useUsers({ enabled: isOpen });
  const stockQ = useInventoryItems(stationId, { enabled: isOpen && !!stationId });
  const queries: SectionQuery[] = stationId ? [productsQ, usersQ, stockQ] : [productsQ, usersQ];
  const editing = !!(
    props.employeeId && props.handoverSales.some((h) => h.attendantId === props.employeeId)
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit handover product sale' : 'Record handover product sale'}
      subtitle="Products sold this shift and not billed one by one"
    >
      <DataSection
        title="products and employees"
        query={queries}
        shape="bare"
        placeholderHeight={360}
        enabled={isOpen}
      >
        <SaleForm
          {...props}
          products={(productsQ.data ?? []) as ProductOption[]}
          users={(usersQ.data ?? []) as UserOption[]}
          stockRows={(stockQ.data ?? []) as { productId: string; quantity: number | string }[]}
        />
      </DataSection>
    </Drawer>
  );
};

interface SaleFormProps extends HandoverProductSaleDrawerProps {
  products: ProductOption[];
  users: UserOption[];
  stockRows: { productId: string; quantity: number | string }[];
}

const SaleForm: React.FC<SaleFormProps> = ({
  onClose,
  shiftId,
  stationId,
  employeeId,
  handoverSales,
  billed,
  products: allProducts,
  users,
  stockRows,
}) => {
  const toast = useToast();
  const save = useKeyedSave(`handover-product-sale:${shiftId}`);
  const record = useRecordHandoverProductSale(stationId);

  const products = useMemo(
    () => allProducts.filter((p) => p.productType !== 'FUEL'),
    [allProducts],
  );
  const productById = useMemo(() => {
    const m: Record<string, ProductOption> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);
  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of stockRows) m[i.productId] = Number(i.quantity);
    return m;
  }, [stockRows]);
  const sellers = useMemo(
    () =>
      users
        .filter((u) => (u.status ? u.status === 'ACTIVE' : true))
        .map((u) => ({ id: u.id, name: u.fullName || u.email || 'User' })),
    [users],
  );
  const options = useMemo(
    () =>
      products.map((p) => {
        const onHand = stock[p.id];
        const price =
          p.sellingPrice != null ? `MRP ${formatMoney(p.sellingPrice)}` : 'No price set';
        return {
          value: p.id,
          label: `${p.name}${p.brand ? ` · ${p.brand}` : ''}`,
          sublabel:
            onHand != null
              ? `${price} · ${formatQuantity(onHand, p.unit || 'Nos')} on hand`
              : price,
        };
      }),
    [products, stock],
  );

  const schema = useMemo(
    () => handoverProductSaleSchema((lines) => draftTotals(lines, productById).total),
    [productById],
  );
  const initial = useMemo(
    () => draftFor(employeeId ?? '', handoverSales),
    [employeeId, handoverSales],
  );
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useZodForm<HandoverProductSaleFormValues>(schema, { defaultValues: initial.values });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const attendantId = watch('attendantId');
  const lines = watch('lines');
  const nonCash = Number(watch('nonCash')) || 0;
  const editingId = useMemo(
    () => handoverSales.find((h) => attendantId && h.attendantId === attendantId)?.id ?? null,
    [handoverSales, attendantId],
  );
  const totals = useMemo(() => draftTotals(lines, productById), [lines, productById]);
  const theirBilled = billed.filter((b) => attendantId && b.attendantId === attendantId);

  // Picking an employee who already has a sale loads it, so it is edited and
  // never replaced by a blank sheet; a fresh employee starts blank.
  const pickEmployee = (id: string) => reset(draftFor(id, handoverSales).values);

  const submit = async (values: HandoverProductSaleFormValues) => {
    const payload = {
      attendantId: values.attendantId,
      lines: saleLines(values.lines),
      nonCashAmount: Number(values.nonCash) || 0,
    };
    try {
      await save({ stationId, shiftId, ...payload }, (idempotencyKey) =>
        record.mutateAsync({ shiftId, payload, idempotencyKey }),
      );
      toast.success(
        editingId ? 'Handover product sale updated.' : 'Handover product sale recorded.',
      );
      onClose();
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Could not save the handover product sale.',
      });
    }
  };

  const submitting = isSubmitting || record.isPending;
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-1">
      {errors.root?.message && (
        <Banner severity="danger" icon={null}>
          {errors.root.message}
        </Banner>
      )}
      <Field label="Employee" htmlFor="hps-employee" required error={errors.attendantId?.message}>
        <Select
          id="hps-employee"
          {...register('attendantId', { onChange: (e) => pickEmployee(e.target.value) })}
          invalid={!!errors.attendantId}
          disabled={submitting}
        >
          <option value="">Select employee</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {handoverSales.some((h) => h.attendantId === s.id) ? ' · recorded (edit)' : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Items sold" error={linesError}>
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => {
            const line = lines[i] ?? BLANK;
            const p = productById[line.productId];
            const qty = Number(line.quantity) || 0;
            const t = p && qty > 0 ? lineTax(p, qty) : null;
            return (
              <div
                key={field.id}
                className="flex flex-col gap-2 rounded-input border border-border-soft bg-surface p-2.5"
              >
                <Combobox
                  options={options}
                  value={line.productId}
                  onChange={(v) =>
                    setValue(`lines.${i}.productId`, v, { shouldDirty: true, shouldValidate: true })
                  }
                  placeholder="Select product…"
                />
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-0.5 text-[12px] text-ink-muted">
                    Qty
                    <NumberInput {...register(`lines.${i}.quantity`)} />
                  </label>
                  <div className="flex flex-1 flex-col gap-0.5 text-[12px] text-ink-muted">
                    MRP
                    <span className="flex h-8 items-center justify-end rounded-input border border-dashed border-border-strong bg-surface-alt px-2.5 font-mono text-[13px] text-ink-strong">
                      {p?.sellingPrice != null ? formatMoney(p.sellingPrice) : '—'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    iconOnly
                    aria-label="Remove line"
                    leftIcon={<Icon name="trash" size="sm" />}
                    disabled={fields.length === 1}
                    onClick={() => remove(i)}
                  />
                </div>
                {t && (
                  <div className="text-right font-mono text-[12px] text-ink-muted">
                    {formatMoney(t.taxable)} + tax {formatMoney(t.tax)} ={' '}
                    <span className="font-semibold text-ink-strong">{formatMoney(t.total)}</span>
                  </div>
                )}
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="plus" size="sm" />}
              onClick={() => append({ ...BLANK })}
            >
              Add item
            </Button>
          </div>
        </div>
      </Field>

      <Field
        label="Paid by card or UPI"
        htmlFor="hps-noncash"
        error={errors.nonCash?.message}
        hint="The part of this sale paid on a terminal. It comes off the cash the employee hands over; leave it blank if all was cash."
      >
        <MoneyInput id="hps-noncash" {...register('nonCash')} invalid={!!errors.nonCash} />
      </Field>

      <dl className="flex flex-col gap-1 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 text-[12px] text-ink-muted">
        <div className="flex justify-between">
          <dt>Taxable</dt>
          <dd className="font-mono">{formatMoney(totals.taxable)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Tax (incl.)</dt>
          <dd className="font-mono">{formatMoney(totals.tax)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Sale total</dt>
          <dd className="font-mono">{formatMoney(totals.total)}</dd>
        </div>
        {nonCash > 0 && (
          <div className="flex justify-between">
            <dt>Less card / UPI</dt>
            <dd className="font-mono">{formatMoney(-nonCash)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border-soft pt-1">
          <dt className="font-semibold">Cash to drawer</dt>
          <dd className="font-mono text-[14px] font-semibold text-ink-strong">
            {formatMoney(cashToDrawer(totals.total, nonCash))}
          </dd>
        </div>
      </dl>

      {theirBilled.length > 0 && (
        <section className="mt-3 flex flex-col gap-1">
          <h3 className="text-[12px] font-semibold text-ink-muted">
            Billed sales by this employee
          </h3>
          <ul className="overflow-hidden rounded-input border border-border-soft">
            {theirBilled.map((b) => (
              <li
                key={b.id}
                className="flex justify-between gap-2 border-b border-border-soft px-2.5 py-1.5 text-[12px] last:border-b-0"
              >
                <span className="text-ink-muted">
                  {(b.items ?? [])
                    .map((it) => `${it.productName || 'Item'} × ${Number(it.quantity)}`)
                    .join(', ') || 'Sale'}
                  {b.customerName ? ` · ${b.customerName}` : ''}
                  {b.paymentMethod ? ` · ${b.paymentMethod}` : ''}
                </span>
                <span className="whitespace-nowrap font-mono text-ink-strong">
                  {formatMoney(b.totalAmount)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-faint">
            Recorded one by one as Billed Sales; shown for the full picture, not edited here.
          </p>
        </section>
      )}

      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" size="md" fullWidth loading={submitting}>
          {editingId ? 'Update sale' : 'Record sale'}
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Form>
  );
};
