import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMyAssignment,
  useProducts,
  useCustomers,
  useInventoryItems,
  useMerchandiseHandovers,
  Combobox,
  CloudShiftService,
  CloudTransactionService,
  queryKeys,
  inr,
} from '@pump/ui';

/**
 * Shared self-service handover UI — mirrors the desktop HandoverDrawer. Loads the
 * signed-in user's OWN active DU assignment and lets them record closing readings
 * (+ per-nozzle testing), per-terminal card/UPI for the DU's assigned POS,
 * fuel-on-credit lines, cash, and a merchandise closing. Used both by the
 * dedicated Attendant shell and by the "My handover" tab that appears for any
 * other role when they are assigned to a dispenser unit on an open shift.
 */

const shiftService = new CloudShiftService();
const txService = new CloudTransactionService();

type TerminalState = Record<string, { card: string; upi: string; batch: string }>;

interface DuFormState {
  readings: Record<string, string>; // nozzleId -> closing
  testing: Record<string, string>; // nozzleId -> testing volume
  terminals: TerminalState; // terminalId -> {card, upi, batch}
  cash: string;
}

interface CreditLine {
  id?: string;
  customerId: string;
  customerName: string;
  vehicleId: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  notes: string | null;
}

interface DuProduct {
  id: string;
  name: string;
  unit: string;
  price: number;
}

const num = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fieldStyle = {
  backgroundColor: 'var(--bg-surface)',
  borderColor: 'var(--border-soft)',
  color: 'var(--text-strong)',
} as const;

const TrashIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  sub?: string;
  placeholder?: string;
  min?: number;
  error?: string;
}> = ({ label, value, onChange, sub, placeholder, min = 0, error }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
      {label}
    </span>
    <input
      type="number"
      inputMode="decimal"
      min={min}
      value={value}
      placeholder={placeholder ?? '0'}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-3 py-2 text-sm font-mono tabular-nums"
      style={{ ...fieldStyle, borderColor: error ? 'var(--state-danger-fg)' : fieldStyle.borderColor }}
    />
    {error ? (
      <span className="text-[11px]" style={{ color: 'var(--state-danger-fg)' }}>{error}</span>
    ) : sub ? (
      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</span>
    ) : null}
  </label>
);

/** Inline fuel-on-credit recorder for one DU — searches a credit/fleet customer
 *  or vehicle, prices from the DU's own fuels, and saves each chit immediately. */
const CreditSaleForm: React.FC<{
  duProducts: DuProduct[];
  customers: any[];
  existing: CreditLine[];
  busy: boolean;
  onAdd: (line: Omit<CreditLine, 'id'>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}> = ({ duProducts, customers, existing, busy, onAdd, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const reset = () => {
    setQuery(''); setResults([]); setShowResults(false);
    setCustomerId(''); setCustomerName(''); setVehicleId(null);
    setProductId(''); setQty(''); setPrice(''); setAmount(''); setNotes('');
  };

  // Combined search: vehicle registration OR customer name (credit/fleet only).
  useEffect(() => {
    if (customerId) { setShowResults(false); return; }
    const q = query.trim();
    if (!q) { setResults([]); setShowResults(false); return; }
    let active = true;
    const t = window.setTimeout(async () => {
      let vehicles: any[] = [];
      try { vehicles = await txService.searchVehicles(q); } catch { vehicles = []; }
      vehicles = vehicles.filter((v: any) => !v.isPrepaid && v.customerType !== 'Regular');
      const ql = q.toLowerCase();
      const custMatches = customers.filter((c: any) => (c.name || '').toLowerCase().includes(ql));
      if (!active) return;
      setResults([
        ...vehicles.map((v: any) => ({ kind: 'vehicle', ...v })),
        ...custMatches.map((c: any) => ({ kind: 'customer', id: c.id, customerId: c.id, customerName: c.name })),
      ]);
      setShowResults(true);
    }, 250);
    return () => { active = false; window.clearTimeout(t); };
  }, [query, customerId, customers]);

  const selectResult = (r: any) => {
    setCustomerId(r.customerId);
    setCustomerName(r.customerName);
    if (r.kind === 'vehicle') {
      setVehicleId(r.id);
      setQuery(r.registrationNumber);
      const match = duProducts.find((p) => p.id === r.defaultProductId);
      if (match) {
        setProductId(match.id);
        if (match.price > 0) setPrice(match.price.toFixed(2));
      }
    } else {
      setVehicleId(null);
      setQuery(r.customerName);
    }
    setShowResults(false);
  };

  const onProduct = (pid: string) => {
    setProductId(pid);
    const p = duProducts.find((x) => x.id === pid);
    const pr = p && p.price > 0 ? p.price : 0;
    setPrice(pr > 0 ? pr.toFixed(2) : '');
    const q = Number(qty);
    if (q > 0 && pr > 0) setAmount((q * pr).toFixed(2));
  };
  const onQty = (v: string) => {
    setQty(v);
    const q = Number(v); const pr = Number(price);
    if (q > 0 && pr > 0) setAmount((q * pr).toFixed(2));
  };
  const onAmount = (v: string) => {
    setAmount(v);
    const a = Number(v); const pr = Number(price);
    if (a > 0 && pr > 0) setQty((a / pr).toFixed(3));
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!customerId || !(amt > 0)) return;
    setAdding(true);
    try {
      await onAdd({
        customerId,
        customerName,
        vehicleId,
        productId: productId || null,
        productName: duProducts.find((p) => p.id === productId)?.name ?? null,
        quantity: Number(qty) > 0 ? Number(qty) : null,
        unitPrice: price && Number(price) >= 0 ? Number(price) : null,
        amount: amt,
        notes: notes || null,
      });
      reset();
      setOpen(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Fuel on credit
      </p>

      {existing.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {existing.map((l, i) => (
            <li
              key={l.id ?? i}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm" style={{ color: 'var(--text-default)' }}>
                  {l.customerName}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {l.productName ?? 'Fuel'}
                  {l.quantity ? ` · ${l.quantity}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--text-strong)' }}>
                  {inr(l.amount)}
                </span>
                {l.id && (
                  <button
                    type="button"
                    onClick={() => onRemove(l.id!)}
                    disabled={busy}
                    className="grid h-7 w-7 place-items-center rounded-lg border disabled:opacity-50"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--state-danger-fg)' }}
                    aria-label="Remove credit sale"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed py-2 text-sm font-medium"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
        >
          + Add credit sale
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-soft)' }}>
          <div className="relative">
            <input
              type="text"
              value={query}
              placeholder="Search customer or vehicle no."
              onChange={(e) => { setQuery(e.target.value); setCustomerId(''); }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle}
            />
            {showResults && results.length > 0 && (
              <ul
                className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
              >
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.id}-${i}`}>
                    <button
                      type="button"
                      onClick={() => selectResult(r)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                      style={{ color: 'var(--text-default)' }}
                    >
                      <span>{r.kind === 'vehicle' ? r.registrationNumber : r.customerName}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {r.kind === 'vehicle' ? r.customerName : 'Customer'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Fuel</span>
            <select
              value={productId}
              onChange={(e) => onProduct(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle}
            >
              <option value="">Select fuel…</option>
              {duProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label={`Quantity${price ? ` @ ${price}` : ''}`} value={qty} onChange={onQty} />
            <NumberField label="Amount (₹)" value={amount} onChange={onAmount} />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { reset(); setOpen(false); }}
              className="flex-1 rounded-lg border py-2 text-sm font-medium"
              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={adding || busy || !customerId || !(Number(amount) > 0)}
              className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const HandoverPanel: React.FC = () => {
  const assignmentQ = useMyAssignment();
  const productsQ = useProducts();
  const customersQ = useCustomers(true);
  const qc = useQueryClient();

  const data = assignmentQ.data;
  const dus: any[] = data?.dispenserUnits ?? [];
  const shiftId: string | undefined = data?.shift?.id;
  const attendantId: string | undefined = data?.userId;
  const stationId: string | undefined = data?.station?.id ?? data?.shift?.stationId;
  const inventoryQ = useInventoryItems(stationId ?? null);
  const merchHandoversQ = useMerchandiseHandovers(shiftId ?? null);

  const [forms, setForms] = useState<Record<string, DuFormState>>({});
  const [creditByDu, setCreditByDu] = useState<Record<string, CreditLine[]>>({});
  const [merchRows, setMerchRows] = useState<{ productId: string; quantity: string }[]>([{ productId: '', quantity: '' }]);
  const [merchNonCash, setMerchNonCash] = useState('');
  const [merchSeeded, setMerchSeeded] = useState(false);
  const [ccBusy, setCcBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed local state once from the assignment (incl. any saved draft + credit lines).
  useEffect(() => {
    if (!dus.length) return;
    setForms((prev) => {
      if (Object.keys(prev).length) return prev; // don't clobber in-progress edits
      const next: Record<string, DuFormState> = {};
      for (const du of dus) {
        const readings: Record<string, string> = {};
        const testing: Record<string, string> = {};
        for (const nz of du.nozzles) {
          readings[nz.nozzleId] = nz.closingReading != null ? String(nz.closingReading) : '';
          testing[nz.nozzleId] = nz.testingVolume != null && Number(nz.testingVolume) > 0 ? String(Number(nz.testingVolume)) : '';
        }
        const terminals: TerminalState = {};
        for (const t of du.terminals) {
          const entry = (du.terminalEntries || []).find((e: any) => e.terminalId === t.terminalId);
          terminals[t.terminalId] = {
            card: entry?.cardAmount != null ? String(Number(entry.cardAmount)) : '',
            upi: entry?.upiAmount != null ? String(Number(entry.upiAmount)) : '',
            batch: entry?.batchRef ?? '',
          };
        }
        next[du.duId] = { readings, testing, terminals, cash: du.handover?.cashHandedOver != null ? String(Number(du.handover.cashHandedOver)) : '' };
      }
      return next;
    });
    setCreditByDu((prev) => {
      if (Object.keys(prev).length) return prev;
      const next: Record<string, CreditLine[]> = {};
      for (const du of dus) next[du.duId] = (du.creditSales || []) as CreditLine[];
      return next;
    });
  }, [dus]);

  // Merchandise products (non-fuel), for the add-line picker.
  const merchProducts = useMemo(
    () => (productsQ.data || []).filter((p: any) => p.productType && p.productType !== 'FUEL' && p.isActive !== false),
    [productsQ.data],
  );
  const merchById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of merchProducts) m[p.id] = p;
    return m;
  }, [merchProducts]);

  // On-hand stock per merchandise product (shown in the picker, like desktop).
  const stock = useMemo(() => {
    const m: Record<string, number> = {};
    (inventoryQ.data || []).forEach((i: any) => { m[i.productId] = Number(i.quantity); });
    return m;
  }, [inventoryQ.data]);

  const merchOptions = useMemo(
    () =>
      merchProducts.map((pr: any) => {
        const onHand = stock[pr.id];
        const priceLabel = pr.sellingPrice != null ? `MRP ${inr(Number(pr.sellingPrice))}` : 'No price set';
        const stockLabel = onHand != null ? `${onHand} ${pr.unit || 'unit'} on hand` : null;
        return {
          value: pr.id,
          label: `${pr.name}${pr.brand ? ` · ${pr.brand}` : ''}`,
          sublabel: stockLabel ? `${priceLabel} · ${stockLabel}` : priceLabel,
        };
      }),
    [merchProducts, stock],
  );

  // Pre-fill the attendant's existing merchandise closing so re-saving edits it
  // instead of wiping it (the server replaces the whole handover on each save).
  useEffect(() => {
    if (merchSeeded || !attendantId || !merchHandoversQ.data) return;
    const mine = (merchHandoversQ.data as any[]).find((h) => h.attendantId === attendantId);
    if (mine && (mine.items?.length ?? 0) > 0) {
      setMerchRows(mine.items.map((it: any) => ({ productId: it.productId, quantity: String(Number(it.quantity)) })));
      if (mine.nonCashAmount != null && Number(mine.nonCashAmount) > 0) setMerchNonCash(String(Number(mine.nonCashAmount)));
    }
    setMerchSeeded(true);
  }, [merchHandoversQ.data, attendantId, merchSeeded]);

  // Credit-eligible customers (non-prepaid Credit/Fleet).
  const creditCustomers = useMemo(
    () => (customersQ.data || []).filter((c: any) => !c.isPrepaid && (c.customerType === 'Credit' || c.customerType === 'Fleet')),
    [customersQ.data],
  );

  const duProductsFor = (du: any): DuProduct[] =>
    Array.from(
      new Map(
        (du.nozzles || [])
          .filter((n: any) => n.productId)
          .map((n: any) => [n.productId, { id: n.productId, name: n.productName ?? 'Fuel', unit: n.unit ?? 'L', price: Number(n.unitPrice || 0) }]),
      ).values(),
    ) as DuProduct[];

  const setReading = (duId: string, nozzleId: string, v: string) =>
    setForms((f) => ({ ...f, [duId]: { ...f[duId], readings: { ...f[duId].readings, [nozzleId]: v } } }));
  const setTesting = (duId: string, nozzleId: string, v: string) =>
    setForms((f) => ({ ...f, [duId]: { ...f[duId], testing: { ...f[duId].testing, [nozzleId]: v } } }));
  const setCash = (duId: string, v: string) =>
    setForms((f) => ({ ...f, [duId]: { ...f[duId], cash: v } }));
  const setTerminal = (duId: string, terminalId: string, field: 'card' | 'upi' | 'batch', v: string) =>
    setForms((f) => ({
      ...f,
      [duId]: { ...f[duId], terminals: { ...f[duId].terminals, [terminalId]: { ...f[duId].terminals[terminalId], [field]: v } } },
    }));

  const addCredit = async (duId: string, line: Omit<CreditLine, 'id'>) => {
    if (!shiftId) return;
    setError(null);
    setCcBusy(true);
    try {
      const entry = await txService.recordCollection({
        shiftId,
        customerId: line.customerId,
        vehicleId: line.vehicleId,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        paymentMethod: 'Credit',
        attendantId: attendantId ?? null,
        duId,
        notes: line.notes ?? undefined,
      });
      setCreditByDu((c) => ({ ...c, [duId]: [...(c[duId] || []), { ...line, id: entry?.id }] }));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add credit sale');
    } finally {
      setCcBusy(false);
    }
  };

  const removeCredit = async (duId: string, id: string) => {
    setError(null);
    setCcBusy(true);
    try {
      await txService.voidCreditSale(id);
      setCreditByDu((c) => ({ ...c, [duId]: (c[duId] || []).filter((l) => l.id !== id) }));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to remove credit sale');
    } finally {
      setCcBusy(false);
    }
  };

  function collectErrors(): string[] {
    const errs: string[] = [];
    for (const du of dus) {
      const form = forms[du.duId];
      if (!form) continue;
      for (const nz of du.nozzles) {
        const raw = form.readings[nz.nozzleId];
        const hasReading = raw !== '' && raw != null;
        const closing = num(raw);
        if (hasReading && closing < nz.openingReading) errs.push(`${nz.nozzleName}: closing below opening`);
        if (closing < 0) errs.push(`${nz.nozzleName}: negative reading`);
        const vol = Math.max(0, closing - nz.openingReading);
        const testingVal = num(form.testing[nz.nozzleId]);
        if (testingVal < 0) errs.push(`${nz.nozzleName}: testing negative`);
        else if (testingVal > vol) errs.push(`${nz.nozzleName}: testing exceeds sold volume`);
      }
      for (const t of du.terminals) {
        if (num(form.terminals[t.terminalId]?.card) < 0 || num(form.terminals[t.terminalId]?.upi) < 0) errs.push(`${du.duName}: negative POS amount`);
      }
      if (num(form.cash) < 0) errs.push(`${du.duName}: negative cash`);
    }
    if (num(merchNonCash) < 0) errs.push('Merchandise non-cash negative');
    for (const r of merchRows) if (num(r.quantity) < 0) errs.push('Merchandise qty negative');
    return errs;
  }

  async function handleSave() {
    if (!shiftId) return;
    if (collectErrors().length > 0) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const du of dus) {
        const form = forms[du.duId];
        if (!form) continue;
        const nozzleReadings = du.nozzles
          .filter((nz: any) => form.readings[nz.nozzleId] !== '' && form.readings[nz.nozzleId] != null)
          .map((nz: any) => ({
            nozzleId: nz.nozzleId,
            closingReading: num(form.readings[nz.nozzleId]),
            testingVolume: num(form.testing[nz.nozzleId]),
          }));
        const terminalEntries = du.terminals
          .map((t: any) => ({
            terminalId: t.terminalId,
            cardAmount: num(form.terminals[t.terminalId]?.card),
            upiAmount: num(form.terminals[t.terminalId]?.upi),
            batchRef: form.terminals[t.terminalId]?.batch || null,
          }))
          .filter((e: any) => e.cardAmount > 0 || e.upiAmount > 0 || e.batchRef);
        const testingTotal = du.nozzles.reduce((s: number, nz: any) => s + num(form.testing[nz.nozzleId]), 0);
        const creditTotal = (creditByDu[du.duId] || []).reduce((s, l) => s + Number(l.amount || 0), 0);

        await shiftService.recordHandover({
          shiftId,
          userId: attendantId,
          duId: du.duId,
          cashHandedOver: num(form.cash),
          creditHandedOver: creditTotal,
          testingVolume: testingTotal,
          terminalEntries,
          nozzleReadings,
        });
      }

      // Merchandise closing (one per attendant per shift) — only if any quantity.
      const merchLines = merchRows
        .map((r) => ({ productId: r.productId, quantity: num(r.quantity) }))
        .filter((l) => l.productId && l.quantity > 0);
      if (merchLines.length) {
        await txService.recordMerchandiseHandover(shiftId, { attendantId, lines: merchLines, nonCashAmount: num(merchNonCash) });
      }

      setSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
      await qc.invalidateQueries({ queryKey: queryKeys.myAssignment() });
      if (shiftId) await qc.invalidateQueries({ queryKey: queryKeys.merchandiseHandovers(shiftId) });
    } catch (e: any) {
      setError(e?.message ?? 'Could not save handover');
    } finally {
      setSaving(false);
    }
  }

  if (assignmentQ.isLoading) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading your shift…
      </p>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--border-soft)' }}>
        <p className="text-4xl">⛽</p>
        <p className="mt-2 font-semibold" style={{ color: 'var(--text-strong)' }}>
          No open shift assigned to you
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Once a manager opens a shift and assigns you to a dispenser unit, it will appear here.
        </p>
      </div>
    );
  }

  // Aggregate reconciliation across all DUs + merchandise (matches desktop).
  let fuelExpected = 0;
  let declaredTotal = 0;
  for (const du of dus) {
    const form = forms[du.duId];
    if (!form) continue;
    for (const nz of du.nozzles) {
      const vol = Math.max(0, num(form.readings[nz.nozzleId]) - nz.openingReading);
      const net = Math.max(0, vol - num(form.testing[nz.nozzleId]));
      fuelExpected += net * Number(nz.unitPrice || 0);
    }
    const cardTotal = du.terminals.reduce((s: number, t: any) => s + num(form.terminals[t.terminalId]?.card), 0);
    const upiTotal = du.terminals.reduce((s: number, t: any) => s + num(form.terminals[t.terminalId]?.upi), 0);
    const creditTotal = (creditByDu[du.duId] || []).reduce((s, l) => s + Number(l.amount || 0), 0);
    declaredTotal += num(form.cash) + cardTotal + upiTotal + creditTotal;
  }
  const merchTotal = merchRows.reduce((s, r) => s + num(r.quantity) * Number(merchById[r.productId]?.sellingPrice || 0), 0);
  const merchCash = Math.max(0, merchTotal - num(merchNonCash));
  const expectedTotal = fuelExpected + merchCash;
  const varianceTotal = Math.round((declaredTotal - expectedTotal) * 100) / 100;
  const formInvalid = collectErrors().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {data.station?.name ?? 'Station'} · {data.shift?.templateName ?? 'Shift'}
        </p>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          Shift open · record as you go
        </p>
      </div>

      {dus.map((du) => {
        const form = forms[du.duId];
        if (!form) return null;
        const duProducts = duProductsFor(du);
        const credit = creditByDu[du.duId] || [];

        return (
          <section
            key={du.duId}
            className="flex flex-col gap-3 rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {du.duName}
              {du.duCode ? <span style={{ color: 'var(--text-faint)' }}> · {du.duCode}</span> : null}
            </h2>

            {/* Closing readings + per-nozzle testing */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Closing readings
              </p>
              <div className="flex flex-col gap-3">
                {du.nozzles.map((nz: any) => {
                  const rawReading = form.readings[nz.nozzleId];
                  const hasReading = rawReading !== '' && rawReading != null;
                  const closing = num(rawReading);
                  const vol = Math.max(0, closing - nz.openingReading);
                  const readingError = hasReading && closing < nz.openingReading ? `Cannot be below opening (${nz.openingReading})` : undefined;
                  const testingVal = num(form.testing[nz.nozzleId]);
                  const testingError = testingVal < 0 ? 'Cannot be negative' : testingVal > vol ? `Cannot exceed ${vol.toFixed(2)} ${nz.unit}` : undefined;
                  return (
                    <div key={nz.nozzleId} className="grid grid-cols-2 gap-3">
                      <NumberField
                        label={`${nz.nozzleName} · ${nz.productName}`}
                        value={rawReading ?? ''}
                        onChange={(v) => setReading(du.duId, nz.nozzleId, v)}
                        sub={`Opening ${nz.openingReading} · ${vol ? `${vol.toFixed(2)} ${nz.unit}` : 'enter closing'}`}
                        error={readingError}
                      />
                      <NumberField
                        label={`Testing (${nz.unit})`}
                        value={form.testing[nz.nozzleId] ?? ''}
                        onChange={(v) => setTesting(du.duId, nz.nozzleId, v)}
                        error={testingError}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card / UPI per assigned terminal */}
            {du.terminals.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Card / UPI by terminal
                </p>
                <div className="flex flex-col gap-3">
                  {du.terminals.map((t: any) => (
                    <div key={t.terminalId} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-soft)' }}>
                      <p className="mb-2 text-sm font-medium" style={{ color: 'var(--text-default)' }}>{t.label}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {t.supportsCard !== false && (
                          <NumberField label="Card" value={form.terminals[t.terminalId]?.card ?? ''} onChange={(v) => setTerminal(du.duId, t.terminalId, 'card', v)} error={num(form.terminals[t.terminalId]?.card) < 0 ? 'No negatives' : undefined} />
                        )}
                        {t.supportsUpi !== false && (
                          <NumberField label="UPI" value={form.terminals[t.terminalId]?.upi ?? ''} onChange={(v) => setTerminal(du.duId, t.terminalId, 'upi', v)} error={num(form.terminals[t.terminalId]?.upi) < 0 ? 'No negatives' : undefined} />
                        )}
                      </div>
                      <label className="mt-2 flex flex-col gap-1">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Batch ref (optional)</span>
                        <input
                          type="text"
                          value={form.terminals[t.terminalId]?.batch ?? ''}
                          onChange={(e) => setTerminal(du.duId, t.terminalId, 'batch', e.target.value)}
                          className="rounded-lg border px-3 py-2 text-sm"
                          style={fieldStyle}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fuel on credit */}
            <CreditSaleForm
              duProducts={duProducts}
              customers={creditCustomers}
              existing={credit}
              busy={ccBusy}
              onAdd={(line) => addCredit(du.duId, line)}
              onRemove={(id) => removeCredit(du.duId, id)}
            />
          </section>
        );
      })}

      {/* Merchandise closing — searchable picker (mirrors desktop) */}
      <section className="flex flex-col gap-3 rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Merchandise closing</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lubes / accessories you sold this shift.</p>

        <div className="flex flex-col gap-2">
          {merchRows.map((row, idx) => {
            const p = merchById[row.productId];
            const mrp = p?.sellingPrice != null ? Number(p.sellingPrice) : null;
            const lineTotal = mrp != null ? mrp * num(row.quantity) : null;
            return (
              <div key={idx} className="flex flex-col gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--border-soft)' }}>
                <Combobox
                  options={merchOptions}
                  value={row.productId}
                  onChange={(v) => setMerchRows((rs) => rs.map((r, i) => (i === idx ? { ...r, productId: v } : r)))}
                  placeholder="Select product…"
                  searchPlaceholder="Search product…"
                />
                <div className="flex items-end gap-2">
                  <label className="flex w-24 flex-col gap-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Qty{p?.unit ? ` (${p.unit})` : ''}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={row.quantity}
                      placeholder="0"
                      onChange={(e) => setMerchRows((rs) => rs.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                      className="rounded-lg border px-3 py-2 text-right text-sm font-mono tabular-nums"
                      style={fieldStyle}
                    />
                  </label>
                  <div className="flex-1 pb-2 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                    {mrp != null ? `MRP ${inr(mrp)}${lineTotal ? ` · ${inr(lineTotal)}` : ''}` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMerchRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : [{ productId: '', quantity: '' }]))}
                    className="grid h-9 w-9 place-items-center rounded-lg border"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--state-danger-fg)' }}
                    aria-label="Remove item"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setMerchRows((rs) => [...rs, { productId: '', quantity: '' }])}
          className="w-full rounded-lg border border-dashed py-2 text-sm font-medium"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
        >
          + Add item
        </button>

        <NumberField
          label="Paid by card / UPI (₹, optional)"
          value={merchNonCash}
          onChange={setMerchNonCash}
          sub="Portion of merchandise not collected as cash"
        />
      </section>

      {/* Cash handed over — recorded last */}
      <section className="flex flex-col gap-3 rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Cash handed over</h2>
        {dus.map((du) => (
          <NumberField
            key={du.duId}
            label={dus.length > 1 ? `${du.duName} · Cash (₹)` : 'Cash (₹)'}
            value={forms[du.duId]?.cash ?? ''}
            onChange={(v) => setCash(du.duId, v)}
            error={num(forms[du.duId]?.cash) < 0 ? 'No negatives' : undefined}
          />
        ))}
        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Confirm physical cash at close.</p>
      </section>

      {/* Sticky summary + save */}
      <div
        className="sticky bottom-0 -mx-4 flex flex-col gap-1 border-t px-4 pb-3 pt-2"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
      >
        {error && (
          <p className="text-center text-xs" style={{ color: 'var(--state-danger-fg)' }}>{error}</p>
        )}
        {formInvalid && !error && (
          <p className="text-center text-[11px]" style={{ color: 'var(--state-danger-fg)' }}>Fix the highlighted fields to save.</p>
        )}
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>
            Expected{' '}
            <span className="font-mono tabular-nums" style={{ color: 'var(--text-strong)' }}>{inr(expectedTotal)}</span>
            {' · '}Declared{' '}
            <span className="font-mono tabular-nums" style={{ color: 'var(--text-strong)' }}>{inr(declaredTotal)}</span>
          </span>
          <span
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color: Math.abs(varianceTotal) < 1 ? 'var(--text-faint)' : varianceTotal < 0 ? 'var(--state-danger-fg)' : 'var(--state-warning-fg)' }}
          >
            {varianceTotal >= 0 ? '+' : ''}{inr(varianceTotal)}
          </span>
        </div>
        {savedAt && !saving && (
          <p className="text-center text-[11px]" style={{ color: 'var(--state-success-fg)' }}>Saved at {savedAt}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || formInvalid}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {saving ? 'Saving…' : 'Save handover'}
        </button>
      </div>
    </div>
  );
};
