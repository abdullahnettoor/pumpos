import React, { useMemo, useState } from 'react';
import { Button, Form, Icon } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { Combobox } from '../primitives/Combobox.js';
import { Field, MoneyInput, NumberInput, Select } from '../primitives/Field.js';
import { Drawer } from '../Drawer.js';
import { useToast } from '../primitives/ToastProvider.js';
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
  draftError,
  draftTotals,
  lineTax,
  saleLines,
  type DraftLine,
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
function draftFor(employeeId: string, sales: HandoverSaleRecord[]) {
  const existing = sales.find((h) => h.attendantId === employeeId);
  if (!existing) return { editingId: null, rows: [BLANK], nonCash: '' };
  const rows = (existing.items ?? []).map((it) => ({
    productId: it.productId,
    quantity: String(Number(it.quantity)),
  }));
  return {
    editingId: existing.id,
    rows: rows.length > 0 ? rows : [BLANK],
    nonCash: Number(existing.nonCashAmount) ? String(Number(existing.nonCashAmount)) : '',
  };
}

/**
 * Record or edit an employee's Handover Product Sale (#533): the non-fuel
 * items they sold during the shift that were not billed one by one. One per
 * employee per shift; picking an employee who already has one opens it for
 * editing, never a second sale. Their Billed Sales are listed read-only for the
 * full picture. Mount it fresh on every open (a `key`): each open is one save,
 * sent with one Idempotency-Key.
 */
export const HandoverProductSaleDrawer: React.FC<HandoverProductSaleDrawerProps> = ({
  isOpen,
  onClose,
  shiftId,
  stationId,
  employeeId,
  handoverSales,
  billed,
}) => {
  const toast = useToast();
  const save = useKeyedSave(`handover-product-sale:${shiftId}`);
  const record = useRecordHandoverProductSale(stationId);
  const productsQ = useProducts({ enabled: isOpen });
  const usersQ = useUsers({ enabled: isOpen });
  const stockQ = useInventoryItems(stationId, { enabled: isOpen && !!stationId });

  const [initial] = useState(() =>
    employeeId ? draftFor(employeeId, handoverSales) : draftFor('', []),
  );
  const [attendantId, setAttendantId] = useState(employeeId ?? '');
  const [editingId, setEditingId] = useState<string | null>(initial.editingId);
  const [rows, setRows] = useState<DraftLine[]>(initial.rows);
  const [nonCash, setNonCash] = useState(initial.nonCash);
  const [error, setError] = useState<string | null>(null);

  const products = useMemo<ProductOption[]>(
    () => ((productsQ.data ?? []) as ProductOption[]).filter((p) => p.productType !== 'FUEL'),
    [productsQ.data],
  );
  const productById = useMemo(() => {
    const m: Record<string, ProductOption> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);
  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of (stockQ.data ?? []) as { productId: string; quantity: number | string }[]) {
      m[i.productId] = Number(i.quantity);
    }
    return m;
  }, [stockQ.data]);
  const sellers = useMemo(
    () =>
      ((usersQ.data ?? []) as UserOption[])
        .filter((u) => (u.status ? u.status === 'ACTIVE' : true))
        .map((u) => ({ id: u.id, name: u.fullName || u.email || 'User' })),
    [usersQ.data],
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

  const totals = useMemo(() => draftTotals(rows, productById), [rows, productById]);
  const nonCashNum = Number(nonCash) || 0;
  const theirBilled = billed.filter((b) => attendantId && b.attendantId === attendantId);

  const pickEmployee = (id: string) => {
    setAttendantId(id);
    const next = draftFor(id, handoverSales);
    setEditingId(next.editingId);
    setRows(next.rows);
    setNonCash(next.nonCash);
    setError(null);
  };

  const setRow = (i: number, patch: Partial<DraftLine>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = draftError({ attendantId, rows, total: totals.total, nonCash: nonCashNum });
    if (problem) {
      setError(problem);
      return;
    }
    const payload = { attendantId, lines: saleLines(rows), nonCashAmount: nonCashNum };
    setError(null);
    try {
      await save({ stationId, shiftId, ...payload }, (idempotencyKey) =>
        record.mutateAsync({ shiftId, payload, idempotencyKey }),
      );
      toast.success(
        editingId ? 'Handover product sale updated.' : 'Handover product sale recorded.',
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the handover product sale.');
    }
  };

  const submitting = record.isPending;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={editingId ? 'Edit handover product sale' : 'Record handover product sale'}
      subtitle="Products sold this shift and not billed one by one"
      footer={
        <div className="flex gap-2">
          <Button
            type="submit"
            form="handover-product-sale"
            variant="primary"
            size="md"
            fullWidth
            loading={submitting}
          >
            {editingId ? 'Update sale' : 'Record sale'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      }
    >
      <Form id="handover-product-sale" onSubmit={submit} className="flex flex-col gap-1">
        {error && (
          <Banner severity="danger" icon={null}>
            {error}
          </Banner>
        )}
        <Field label="Employee" htmlFor="hps-employee" required>
          <Select
            id="hps-employee"
            value={attendantId}
            onChange={(e) => pickEmployee(e.target.value)}
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

        <Field label="Items sold">
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const p = productById[r.productId];
              const qty = Number(r.quantity) || 0;
              const t = p && qty > 0 ? lineTax(p, qty) : null;
              return (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-input border border-border-soft bg-surface p-2.5"
                >
                  <Combobox
                    options={options}
                    value={r.productId}
                    onChange={(v) => setRow(i, { productId: v })}
                    placeholder="Select product…"
                  />
                  <div className="flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-0.5 text-[12px] text-ink-muted">
                      Qty
                      <NumberInput
                        value={r.quantity}
                        onChange={(e) => setRow(i, { quantity: e.target.value })}
                      />
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
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
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
                onClick={() => setRows((prev) => [...prev, BLANK])}
              >
                Add item
              </Button>
            </div>
          </div>
        </Field>

        <Field
          label="Paid by card or UPI"
          htmlFor="hps-noncash"
          hint="The part of this sale paid on a terminal. It comes off the cash the employee hands over; leave it blank if all was cash."
        >
          <MoneyInput
            id="hps-noncash"
            value={nonCash}
            onChange={(e) => setNonCash(e.target.value)}
          />
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
          {nonCashNum > 0 && (
            <div className="flex justify-between">
              <dt>Less card / UPI</dt>
              <dd className="font-mono">{formatMoney(-nonCashNum)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border-soft pt-1">
            <dt className="font-semibold">Cash to drawer</dt>
            <dd className="font-mono text-[14px] font-semibold text-ink-strong">
              {formatMoney(cashToDrawer(totals.total, nonCashNum))}
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
      </Form>
    </Drawer>
  );
};
