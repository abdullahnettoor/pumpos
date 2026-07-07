import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../Drawer.js';
import { Combobox } from '../primitives/Combobox.js';
import { Select, NumberInput } from '../primitives/Field.js';
import { useToast } from '../primitives/ToastProvider.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { CloudTransactionService, CloudProductService, CloudUserAssignmentService } from '../../services/cloud.js';
import { inr } from '../../utils/format.js';
import { Package, Plus, Trash2, Pencil } from 'lucide-react';

const txService = new CloudTransactionService();
const productService = new CloudProductService();
const userService = new CloudUserAssignmentService();

export interface MerchandiseHandoversPanelProps {
  shiftId: string;
  /** Called after a handover is recorded/deleted so the shift reconciliation refreshes. */
  onChanged?: () => void;
  /** Bump to force a reload (e.g. after a quick-entry merchandise sale elsewhere). */
  refreshKey?: number;
}

interface LineRow {
  productId: string;
  quantity: string;
}

/** Per-line tax breakdown from a product's config (mirrors core computeLineTax). */
function lineTax(product: any, qty: number) {
  const price = product?.sellingPrice != null ? Number(product.sellingPrice) : 0;
  const gross = qty * price;
  const cat = product?.taxCategory || 'GST';
  const rate = cat === 'GST' ? Number(product?.taxConfig?.gst_rate ?? 0) : cat === 'FUEL_VAT' ? Number(product?.taxConfig?.vat_rate ?? 0) : 0;
  const inclusive = product?.taxConfig?.price_inclusive !== false;
  if (rate > 0 && (cat === 'GST' || cat === 'FUEL_VAT')) {
    if (inclusive) {
      const taxable = gross / (1 + rate / 100);
      return { taxable, tax: gross - taxable, total: gross };
    }
    const tax = gross * (rate / 100);
    return { taxable: gross, tax, total: gross + tax };
  }
  return { taxable: gross, tax: 0, total: gross };
}

/**
 * Merchandise Handovers (Phase T4b) — a per-employee, itemized tally of walk-in
 * non-fuel sales for a shift, recorded independently so shift close stays
 * seamless. Each handover is a cash sale attributed to the employee, so it flows
 * into their cash-handover reconciliation. Editable while the shift is open.
 */
export const MerchandiseHandoversPanel: React.FC<MerchandiseHandoversPanelProps> = ({ shiftId, onChanged, refreshKey }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [handovers, setHandovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [sellers, setSellers] = useState<{ userId: string; userName: string }[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attendantId, setAttendantId] = useState('');
  const [rows, setRows] = useState<LineRow[]>([{ productId: '', quantity: '' }]);
  const [nonCash, setNonCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billed, setBilled] = useState<any[]>([]);

  const load = async () => {
    if (!shiftId) return;
    setLoading(true);
    try {
      const [ho, bs] = await Promise.all([
        txService.getMerchandiseHandovers(shiftId),
        txService.getMerchandiseSales(shiftId).catch(() => []),
      ]);
      setHandovers(ho);
      setBilled(bs || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId, refreshKey]);

  const ensureRefData = async () => {
    if (products.length === 0) {
      const list = await productService.listProducts().catch(() => []);
      setProducts((list || []).filter((p: any) => p.productType !== 'FUEL'));
    }
    if (sellers.length === 0) {
      const users = await userService.listUsers().catch(() => []);
      setSellers(
        (users || [])
          .filter((u: any) => (u.status ? u.status === 'ACTIVE' : true))
          .map((u: any) => ({ userId: u.id, userName: u.fullName || u.email || 'User' })),
      );
    }
  };

  const productById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const openNew = async () => {
    await ensureRefData();
    setEditingId(null);
    setAttendantId('');
    setRows([{ productId: '', quantity: '' }]);
    setNonCash('');
    setError(null);
    setDrawerOpen(true);
  };

  // Selecting an employee who already has a closing loads it as an edit (so we
  // never silently replace their existing items); a fresh employee starts blank.
  const handleSelectEmployee = (userId: string) => {
    setAttendantId(userId);
    const existing = handovers.find((h) => h.attendantId === userId);
    if (existing) {
      setEditingId(existing.id);
      setRows((existing.items || []).map((it: any) => ({ productId: it.productId, quantity: String(Number(it.quantity)) })));
      setNonCash(Number(existing.nonCashAmount) ? String(Number(existing.nonCashAmount)) : '');
    } else {
      setEditingId(null);
      setRows([{ productId: '', quantity: '' }]);
      setNonCash('');
    }
  };

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    let total = 0;
    for (const r of rows) {
      const p = productById[r.productId];
      const qty = Number(r.quantity) || 0;
      if (!p || qty <= 0) continue;
      const t = lineTax(p, qty);
      taxable += t.taxable;
      tax += t.tax;
      total += t.total;
    }
    return { taxable, tax, total };
  }, [rows, productById]);

  const submit = async () => {
    const lines = rows
      .filter((r) => r.productId && Number(r.quantity) > 0)
      .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));
    if (!attendantId) {
      setError('Select the employee who made the sales.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product with a quantity.');
      return;
    }
    const nonCashNum = Number(nonCash) || 0;
    if (nonCashNum > totals.total + 0.001) {
      setError('Card/UPI portion cannot exceed the sale total.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await txService.recordMerchandiseHandover(shiftId, { attendantId, lines, nonCashAmount: nonCashNum });
      setDrawerOpen(false);
      await load();
      onChanged?.();
      toast.success('Merchandise handover recorded.');
    } catch (err: any) {
      setError(err.message || 'Failed to record merchandise handover.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (h: any) => {
    if (!(await confirm({ title: 'Remove merchandise handover?', message: `Delete ${h.attendantName || 'this employee'}'s merchandise closing and restore stock?`, danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await txService.deleteMerchandiseHandover(h.id);
      await load();
      onChanged?.();
      toast.success('Merchandise handover removed.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove handover.');
    }
  };

  // Open the drawer for a given employee: loads their handover as an edit if any,
  // otherwise a blank sheet; either way the billed-sales view lists their tickets.
  const openForEmployee = async (empId: string | null) => {
    if (!empId) return;
    await ensureRefData();
    handleSelectEmployee(empId);
    setError(null);
    setDrawerOpen(true);
  };

  // One row per employee, bucketed by payment rail so the panel ties exactly with
  // the attendant handover drawer: Cash → drawer, Card/UPI → terminal batch,
  // Credit → receivable. Both the bulk handover and billed quick-entry sales fold
  // in by their actual method (a Cash handover may carry a non-cash portion).
  const employeeRows = useMemo(() => {
    const map = new Map<string, { attendantId: string | null; name: string; handover: any | null; hasBilled: boolean; cash: number; nonCash: number; credit: number }>();
    const get = (id: string | null, name: string) => {
      const key = id || '__none__';
      if (!map.has(key)) map.set(key, { attendantId: id, name, handover: null, hasBilled: false, cash: 0, nonCash: 0, credit: 0 });
      return map.get(key)!;
    };
    const bucket = (e: { cash: number; nonCash: number; credit: number }, method: string | null | undefined, total: number, nonCash: number) => {
      if (method === 'Card' || method === 'UPI') e.nonCash += total;
      else if (method === 'Credit') e.credit += total;
      else { e.cash += total - nonCash; e.nonCash += nonCash; } // Cash (or default): split off any non-cash portion
    };
    for (const h of handovers) {
      const e = get(h.attendantId || null, h.attendantName || 'Unassigned');
      e.handover = h;
      bucket(e, 'Cash', Number(h.totalAmount || 0), Number(h.nonCashAmount || 0));
      if (h.attendantName) e.name = h.attendantName;
    }
    for (const b of billed) {
      const e = get(b.attendantId || null, b.attendantName || 'Unassigned');
      e.hasBilled = true;
      bucket(e, b.paymentMethod, Number(b.totalAmount || 0), Number(b.nonCashAmount || 0));
      if (b.attendantName && e.name === 'Unassigned') e.name = b.attendantName;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [handovers, billed]);

  const cashTotal = employeeRows.reduce((s, e) => s + e.cash, 0);
  const nonCashTotal = employeeRows.reduce((s, e) => s + e.nonCash, 0);
  const creditTotal = employeeRows.reduce((s, e) => s + e.credit, 0);
  const grandTotal = cashTotal + nonCashTotal + creditTotal;
  const hasCredit = creditTotal > 0.0001;
  const isEmpty = handovers.length === 0 && billed.length === 0;
  const colCount = hasCredit ? 5 : 4;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>Merchandise Handovers</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Walk-in non-fuel sales tallied per employee. Folds into their cash handover.</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={13} /> Record Closing
        </button>
      </div>

      <table className="shift-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
            {['Employee', 'Cash', 'Card/UPI', ...(hasCredit ? ['Credit'] : []), ''].map((h, i) => (
              <th key={h || `sp${i}`} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i >= 1 && h ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={colCount} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
          ) : isEmpty ? (
            <tr><td colSpan={colCount} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No merchandise recorded yet.</td></tr>
          ) : (
            employeeRows.map((e) => (
              <tr
                key={e.attendantId || '__none__'}
                onClick={() => openForEmployee(e.attendantId)}
                style={{ borderBottom: '1px solid var(--border-soft)', cursor: e.attendantId ? 'pointer' : 'default' }}
              >
                <td style={{ padding: '10px 16px', color: 'var(--text-strong)', fontWeight: 500 }}>{e.name}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: e.cash ? 'var(--text-strong)' : 'var(--text-faint)' }}>{e.cash ? inr(e.cash) : '—'}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: e.nonCash ? 'var(--text-strong)' : 'var(--text-faint)' }}>{e.nonCash ? inr(e.nonCash) : '—'}</td>
                {hasCredit && (
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: e.credit ? 'var(--text-strong)' : 'var(--text-faint)' }}>{e.credit ? inr(e.credit) : '—'}</td>
                )}
                <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {e.attendantId && (
                    <button className="btn btn-secondary btn-sm" onClick={(ev) => { ev.stopPropagation(); openForEmployee(e.attendantId); }} style={{ padding: '3px 6px', marginRight: '4px' }} aria-label="Edit"><Pencil size={13} /></button>
                  )}
                  {e.handover && (
                    <button className="btn btn-secondary btn-sm" onClick={(ev) => { ev.stopPropagation(); remove(e.handover); }} style={{ padding: '3px 6px' }} aria-label="Remove"><Trash2 size={13} /></button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {!isEmpty && (
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-surface-alt)' }}>
              <td style={{ padding: '8px 16px', fontWeight: 700, color: 'var(--text-strong)' }}>Total merchandise{grandTotal ? ` · ${inr(grandTotal)}` : ''}</td>
              <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(cashTotal)}</td>
              <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(nonCashTotal)}</td>
              {hasCredit && (
                <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(creditTotal)}</td>
              )}
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={editingId ? 'Edit Merchandise Handover' : 'Record Merchandise Handover'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '10px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>{error}</div>
          )}

          <div>
            <label className="field-label">Employee</label>
            <Select value={attendantId} onChange={(e) => handleSelectEmployee(e.target.value)} disabled={submitting}>
              <option value="">— Select employee —</option>
              {sellers.map((s) => {
                const recorded = handovers.some((h) => h.attendantId === s.userId);
                return (
                  <option key={s.userId} value={s.userId}>
                    {s.userName}{recorded ? ' · recorded (edit)' : ''}
                  </option>
                );
              })}
            </Select>
          </div>

          <div>
            <label className="field-label">Items sold</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rows.map((r, i) => {
                const p = productById[r.productId];
                const qty = Number(r.quantity) || 0;
                const t = p && qty > 0 ? lineTax(p, qty) : null;
                return (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <Combobox
                        options={products.map((pr) => ({ value: pr.id, label: `${pr.name}${pr.brand ? ` · ${pr.brand}` : ''}`, sublabel: pr.sellingPrice != null ? `MRP ${inr(pr.sellingPrice)}` : 'No price set' }))}
                        value={r.productId}
                        onChange={(v) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, productId: v } : x)))}
                        placeholder="Select product…"
                      />
                      {t && <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px' }}>{inr(t.taxable)} + tax {inr(t.tax)} = {inr(t.total)}</div>}
                    </div>
                    <div style={{ width: 76 }}>
                      <NumberInput placeholder="Qty" value={r.quantity} onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '6px 8px', height: 32 }} onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))} aria-label="Remove line"><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => setRows((prev) => [...prev, { productId: '', quantity: '' }])}>
              <Plus size={13} /> Add item
            </button>
          </div>

          <div>
            <label className="field-label">Paid by card/UPI — non-cash (₹)</label>
            <NumberInput placeholder="0" value={nonCash} onChange={(e) => setNonCash(e.target.value)} />
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              Portion of this sale paid by card/UPI on a terminal. It's subtracted from the cash the employee hands over (the card money is in the terminal batch). Leave 0 if all cash.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}><span>Taxable</span><span style={{ fontFamily: 'var(--font-mono)' }}>{inr(totals.taxable)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}><span>Tax (incl.)</span><span style={{ fontFamily: 'var(--font-mono)' }}>{inr(totals.tax)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}><span>Sale total</span><span style={{ fontFamily: 'var(--font-mono)' }}>{inr(totals.total)}</span></div>
            {Number(nonCash) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}><span>− Card/UPI (non-cash)</span><span style={{ fontFamily: 'var(--font-mono)' }}>{inr(Number(nonCash))}</span></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Cash to drawer</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-strong)' }}>{inr(Math.max(0, totals.total - (Number(nonCash) || 0)))}</strong>
            </div>
          </div>

          {attendantId && billed.filter((b) => b.attendantId === attendantId).length > 0 && (
            <div>
              <label className="field-label">Billed sales by this employee (view only)</label>
              <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', overflow: 'hidden' }}>
                {billed.filter((b) => b.attendantId === attendantId).map((b) => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', borderBottom: '1px solid var(--border-soft)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {(b.items || []).map((it: any) => `${it.productName || 'Item'} × ${Number(it.quantity)}`).join(', ') || 'Sale'}
                      {b.customerName ? ` · ${b.customerName}` : ''} · {b.paymentMethod}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{inr(b.totalAmount)}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Recorded via the quick sale drawer — shown here for the full picture. Not editable here.</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={submitting} onClick={submit}>{submitting ? 'Saving…' : editingId ? 'Update Handover' : 'Record Handover'}</button>
            <button className="btn btn-secondary btn-md" disabled={submitting} onClick={() => setDrawerOpen(false)}>Cancel</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
};
