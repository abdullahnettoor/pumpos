import React, { useState } from 'react';
import {
  useCustomers,
  useSuppliers,
  useCustomerLedger,
  useSupplierLedger,
  inr,
} from '@pump/ui';
import { Kpi } from '../components/Kpi.js';

type Kind = 'customers' | 'suppliers';

const dateFmt = (v?: string) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

/** Friendly names for raw transaction types. */
const TXN_LABEL: Record<string, string> = {
  'Credit Sale': 'Credit sale',
  Collection: 'Payment received',
  Adjustment: 'Adjustment',
  Purchase: 'Purchase',
  Payment: 'Payment made',
};

/** Signed effect a transaction has on the running balance. Collections (from a
 *  customer) and Payments (to a supplier) REDUCE the balance; everything else
 *  increases it. */
function delta(kind: Kind, txnType: string, amount: number): number {
  const reduces = kind === 'customers' ? txnType === 'Collection' : txnType === 'Payment';
  return reduces ? -amount : amount;
}

const LedgerDetail: React.FC<{ kind: Kind; id: string; balance: number }> = ({ kind, id, balance }) => {
  const custQ = useCustomerLedger(kind === 'customers' ? id : null);
  const suppQ = useSupplierLedger(kind === 'suppliers' ? id : null);
  const q = kind === 'customers' ? custQ : suppQ;

  // Running balance in chronological order, then show the latest first.
  let running = 0;
  const withRunning = (q.data || []).map((r: any) => {
    const d = delta(kind, r.transactionType, Number(r.amount || 0));
    running += d;
    return { ...r, _delta: d, _running: running };
  });
  const rows = withRunning.slice(-10).reverse();

  const phrase =
    balance > 0
      ? kind === 'customers'
        ? `Owes you ${inr(balance)}`
        : `You owe ${inr(balance)}`
      : balance < 0
        ? kind === 'customers'
          ? `In advance ${inr(-balance)}`
          : `Advance paid ${inr(-balance)}`
        : 'Settled — nothing due';

  if (q.isLoading) {
    return <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  }
  return (
    <div>
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: 'var(--border-soft)', backgroundColor: 'var(--bg-surface-alt)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Balance</span>
        <span
          className="text-sm font-semibold"
          style={{ color: balance > 0 ? 'var(--state-warning-fg)' : balance < 0 ? 'var(--state-success-fg)' : 'var(--text-muted)' }}
        >
          {phrase}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No transactions yet.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border-soft)' }}>
          {rows.map((r: any, i: number) => {
            const reducing = r._delta < 0;
            return (
              <li key={r.id ?? i} className="flex items-center justify-between px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-default)' }}>
                    {TXN_LABEL[r.transactionType] ?? r.transactionType ?? 'Entry'}
                  </p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {dateFmt(r.businessDate ?? r.createdAt)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="font-mono text-sm tabular-nums"
                    style={{ color: reducing ? 'var(--state-success-fg)' : 'var(--text-strong)' }}
                  >
                    {reducing ? '−' : '+'}{inr(Math.abs(r._delta))}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    Bal {inr(r._running)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const LedgerScreen: React.FC = () => {
  const [kind, setKind] = useState<Kind>('customers');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const customersQ = useCustomers();
  const suppliersQ = useSuppliers();
  const q = kind === 'customers' ? customersQ : suppliersQ;

  const customers: any[] = customersQ.data || [];
  const suppliers: any[] = suppliersQ.data || [];
  const receivablesTotal = customers.reduce((s, c) => s + Math.max(0, Number(c.currentBalance || 0)), 0);
  const payablesTotal = suppliers.reduce((s, x) => s + Math.max(0, Number(x.currentBalance || 0)), 0);
  const overLimitCount = customers.filter(
    (c) => Number(c.creditLimit || 0) > 0 && Number(c.currentBalance || 0) > Number(c.creditLimit || 0),
  ).length;

  const rows = (q.data || [])
    .filter((r: any) => r.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => Math.abs(Number(b.currentBalance || 0)) - Math.abs(Number(a.currentBalance || 0)));

  return (
    <div className="flex flex-col gap-3">
      {/* Money-health summary */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Receivables" value={inr(receivablesTotal)} sub="Customers owe you" tone={receivablesTotal > 0 ? 'warning' : 'default'} />
        <Kpi label="Payables" value={inr(payablesTotal)} sub="You owe suppliers" tone={payablesTotal > 0 ? 'warning' : 'default'} />
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Tap a name to see its balance and recent transactions.
      </p>
      {overLimitCount > 0 && (
        <button
          type="button"
          onClick={() => { setKind('customers'); setSearch(''); }}
          className="rounded-lg px-3 py-2 text-left text-xs font-medium"
          style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)' }}
        >
          {overLimitCount} customer{overLimitCount === 1 ? '' : 's'} over credit limit
        </button>
      )}

      <div
        className="grid grid-cols-2 gap-1 rounded-lg p-1"
        style={{ backgroundColor: 'var(--bg-surface-alt)' }}
      >
        {(['customers', 'suppliers'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setOpenId(null); }}
            className="rounded-md py-1.5 text-sm font-medium capitalize transition"
            style={{
              backgroundColor: kind === k ? 'var(--bg-surface)' : 'transparent',
              color: kind === k ? 'var(--text-strong)' : 'var(--text-muted)',
              boxShadow: kind === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${kind}…`}
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)', color: 'var(--text-strong)' }}
      />

      {q.isLoading ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No {kind} found.</p>
          )}
          {rows.map((r: any) => {
            const balance = Number(r.currentBalance || 0);
            const isOpen = openId === r.id;
            const isOverLimit =
              kind === 'customers' && Number(r.creditLimit || 0) > 0 && balance > Number(r.creditLimit || 0);
            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-xl border"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>{r.name}</p>
                      {isOverLimit && (
                        <span
                          className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)' }}
                        >
                          Over limit
                        </span>
                      )}
                    </div>
                    {r.phone && (
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.phone}</p>
                    )}
                  </div>
                  <span
                    className="font-mono text-sm font-semibold tabular-nums"
                    style={{ color: isOverLimit ? 'var(--state-danger-fg)' : balance > 0 ? 'var(--state-warning-fg)' : 'var(--text-muted)' }}
                  >
                    {inr(balance)}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                    <LedgerDetail kind={kind} id={r.id} balance={balance} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
