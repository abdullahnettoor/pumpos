import React, { useMemo, useRef, useState } from 'react';
import { Combobox, inr, runTask } from '@pump/ui';
import type { CreditLine, DuProduct } from '../../lib/handover/model.js';
import { AddButton, NumberField, SelectField, TextField } from './Fields.js';
import { TrashIcon } from './icons.js';

// A fresh idempotency key per customer-sale line, so a retry of the SAME line
// (e.g. after a flaky-network blip) de-dupes server-side instead of double-posting.
const genIdemKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Inline customer-sale recorder for one DU. A single client-side picker (cached
 *  customers + vehicles — no server search) drives both channels: Credit (a
 *  station receivable) and OMC card (settled to the CMS account, optional
 *  customer). Prices from the DU's own fuels; each line saves immediately. */
export const CustomerSaleForm: React.FC<{
  duProducts: DuProduct[];
  customers: any[];
  allVehicles: any[];
  credit: CreditLine[];
  omc: CreditLine[];
  busy: boolean;
  onAdd: (
    channel: 'credit' | 'omc',
    line: Omit<CreditLine, 'id'>,
    idempotencyKey: string,
  ) => Promise<void>;
  onRemove: (channel: 'credit' | 'omc', id: string) => Promise<void>;
}> = ({ duProducts, customers, allVehicles, credit, omc, busy, onAdd, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'credit' | 'omc'>('credit');
  const [selectValue, setSelectValue] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  // Idempotency key for the line being added — kept across a failed retry
  // (same key → server de-dupes), cleared on success or any edit.
  const idemKeyRef = useRef<string | null>(null);

  const reset = () => {
    idemKeyRef.current = null;
    setSelectValue('');
    setChannel('credit');
    setCustomerId('');
    setCustomerName('');
    setCustomerType(null);
    setVehicleId(null);
    setVehicleLabel('');
    setProductId('');
    setQty('');
    setPrice('');
    setAmount('');
    setNotes('');
  };

  // Combined, cached option list: vehicles (scoped to the passed customers) + customers.
  const options = useMemo(() => {
    const customerIds = new Set(customers.map((c: any) => c.id));
    const opts: { value: string; label: string; sublabel?: string }[] = [];
    for (const v of allVehicles) {
      if (!customerIds.has(v.customerId)) continue;
      const parts = [v.customerName, v.customerType, v.defaultProductName].filter(Boolean);
      opts.push({ value: `v:${v.id}`, label: v.registrationNumber, sublabel: parts.join(' · ') });
    }
    for (const c of customers)
      opts.push({ value: `c:${c.id}`, label: c.name, sublabel: c.customerType });
    return opts;
  }, [allVehicles, customers]);

  const defaultChannelFor = (cust: any): 'credit' | 'omc' =>
    cust?.customerType === 'Fleet' && cust?.isPrepaid ? 'omc' : 'credit';

  const onSelect = (value: string) => {
    idemKeyRef.current = null;
    setSelectValue(value);
    if (value.startsWith('v:')) {
      const v = allVehicles.find((x: any) => `v:${x.id}` === value);
      if (!v) return;
      const cust = customers.find((c: any) => c.id === v.customerId);
      setCustomerId(v.customerId);
      setCustomerName(v.customerName ?? 'Customer');
      setCustomerType(v.customerType ?? cust?.customerType ?? null);
      setChannel(
        defaultChannelFor(cust ?? { customerType: v.customerType, isPrepaid: v.isPrepaid }),
      );
      setVehicleId(v.id);
      setVehicleLabel(v.registrationNumber);
      const match = duProducts.find((p) => p.id === v.defaultProductId);
      if (match) {
        setProductId(match.id);
        if (match.price > 0) setPrice(match.price.toFixed(2));
      }
    } else if (value.startsWith('c:')) {
      const id = value.slice(2);
      const c = customers.find((x: any) => x.id === id);
      setCustomerId(id);
      setCustomerName(c?.name ?? 'Customer');
      setCustomerType(c?.customerType ?? null);
      setChannel(defaultChannelFor(c));
      setVehicleId(null);
      setVehicleLabel('');
    }
  };

  const onProduct = (pid: string) => {
    idemKeyRef.current = null;
    setProductId(pid);
    const p = duProducts.find((x) => x.id === pid);
    const pr = p && p.price > 0 ? p.price : 0;
    setPrice(pr > 0 ? pr.toFixed(2) : '');
    const q = Number(qty);
    if (q > 0 && pr > 0) setAmount((q * pr).toFixed(2));
  };
  const onQty = (v: string) => {
    idemKeyRef.current = null;
    setQty(v);
    const q = Number(v);
    const pr = Number(price);
    if (q > 0 && pr > 0) setAmount((q * pr).toFixed(2));
  };
  const onAmount = (v: string) => {
    idemKeyRef.current = null;
    setAmount(v);
    const a = Number(v);
    const pr = Number(price);
    if (a > 0 && pr > 0) setQty((a / pr).toFixed(3));
  };

  const isOmc = channel === 'omc';
  const submit = async () => {
    const amt = Number(amount);
    if ((!isOmc && !customerId) || !(amt > 0)) return;
    setAdding(true);
    try {
      const idempotencyKey = idemKeyRef.current ?? (idemKeyRef.current = genIdemKey());
      await onAdd(
        channel,
        {
          customerId: customerId || null,
          customerName: customerId ? customerName : null,
          customerType,
          vehicleId,
          vehicleLabel: vehicleLabel || null,
          productId: productId || null,
          productName: duProducts.find((p) => p.id === productId)?.name ?? null,
          quantity: Number(qty) > 0 ? Number(qty) : null,
          unitPrice: price && Number(price) >= 0 ? Number(price) : null,
          amount: amt,
          notes: notes || null,
        },
        idempotencyKey,
      );
      reset();
      setOpen(false);
    } finally {
      setAdding(false);
    }
  };

  const start = (ch: 'credit' | 'omc') => {
    setChannel(ch);
    setOpen(true);
  };

  const renderList = (label: string, lines: CreditLine[], ch: 'credit' | 'omc') =>
    lines.length > 0 ? (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.08em] text-text-faint">
          <span>{label}</span>
          <span className="num text-text-high">
            {inr(lines.reduce((s, l) => s + Number(l.amount || 0), 0))}
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <li
              key={l.id ?? i}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-card-alt px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text-high">
                  {l.customerName || 'Fuel card (no customer)'}
                </p>
                <p className="num truncate text-[11px] text-text-muted">
                  {[
                    l.vehicleLabel,
                    [
                      l.quantity
                        ? `${l.quantity} ${duProducts.find((p) => p.id === l.productId)?.unit ?? 'L'}`
                        : null,
                      l.productName ?? 'Fuel',
                    ]
                      .filter(Boolean)
                      .join(' '),
                    l.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <b className="num text-[13px] text-text-high">{inr(l.amount)}</b>
              {l.id && (
                <button
                  type="button"
                  onClick={() =>
                    // The panel shows the operator-facing message via setError;
                    // this only catches what that path re-throws.
                    runTask(onRemove(ch, l.id!), (error: unknown) =>
                      console.error('Failed to remove sale:', error),
                    )
                  }
                  disabled={busy}
                  className="hit-44 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-line text-bad-fg disabled:opacity-50"
                  aria-label="Remove sale"
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      {renderList('Credit', credit, 'credit')}
      {renderList('Fuel card · CMS', omc, 'omc')}

      {!open ? (
        <div className="grid grid-cols-2 gap-2">
          <AddButton onClick={() => start('credit')}>+ Credit sale</AddButton>
          <AddButton onClick={() => start('omc')}>+ Fuel card</AddButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line-strong p-3">
          {/* Channel toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card-alt p-[3px]">
            {(['credit', 'omc'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                aria-pressed={channel === ch}
                className={`rounded-lg py-1.5 text-xs font-semibold ${
                  channel === ch ? 'bg-card text-text-high shadow-chip' : 'text-text-muted'
                }`}
              >
                {ch === 'credit' ? 'Credit (receivable)' : 'Fuel card → CMS'}
              </button>
            ))}
          </div>
          {isOmc && (
            <p className="text-[11px] text-text-muted">
              Settled to CMS by the Oil Company — not a receivable. Customer optional.
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-text-muted">
              Customer or vehicle{isOmc ? ' (optional)' : ''}
            </span>
            <Combobox
              options={options}
              value={selectValue}
              onChange={onSelect}
              placeholder="Select customer or vehicle…"
              searchPlaceholder="Search name or vehicle no.…"
              emptyMessage="No customer or vehicle found."
            />
          </label>

          <SelectField label="Fuel" value={productId} onChange={onProduct}>
            <option value="">Select fuel…</option>
            {duProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={`Quantity${price ? ` @ ${price}` : ''}`}
              value={qty}
              onChange={onQty}
            />
            <NumberField label="Amount (₹)" value={amount} onChange={onAmount} />
          </div>

          <TextField
            label="Remarks (driver, slip no.)"
            value={notes}
            onChange={setNotes}
            placeholder="e.g. driver / slip ref"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="h-11 flex-1 rounded-xl border border-line-strong text-sm font-semibold text-text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                runTask(submit(), (error: unknown) => console.error('Failed to add sale:', error))
              }
              disabled={adding || busy || (!isOmc && !customerId) || !(Number(amount) > 0)}
              className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
            >
              {adding ? 'Adding…' : isOmc ? 'Add fuel card sale' : 'Add credit sale'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
