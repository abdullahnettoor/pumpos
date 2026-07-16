import React, { useState } from 'react';
import {
  useCustomers,
  useSuppliers,
  useCustomerLedger,
  useSupplierLedger,
  inr,
} from '@pump/ui';

type Kind = 'customers' | 'suppliers';

const dateFmt = (v?: string) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const LedgerDetail: React.FC<{ kind: Kind; id: string }> = ({ kind, id }) => {
  const custQ = useCustomerLedger(kind === 'customers' ? id : null);
  const suppQ = useSupplierLedger(kind === 'suppliers' ? id : null);
  const q = kind === 'customers' ? custQ : suppQ;
  const rows: any[] = (q.data || []).slice(-8).reverse();

  if (q.isLoading) {
    return <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No recent entries.</p>;
  }
  return (
    <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border-soft)' }}>
      {rows.map((r, i) => {
        const amount = Number(r.amount ?? r.debit ?? r.credit ?? 0);
        const label = r.description || r.type || r.entryType || r.referenceType || 'Entry';
        return (
          <li key={r.id ?? i} className="flex items-center justify-between px-4 py-2">
            <div>
              <p className="text-sm" style={{ color: 'var(--text-default)' }}>{label}</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{dateFmt(r.date ?? r.createdAt ?? r.businessDate)}</p>
            </div>
            <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--text-strong)' }}>
              {inr(amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export const LedgerScreen: React.FC = () => {
  const [kind, setKind] = useState<Kind>('customers');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const customersQ = useCustomers();
  const suppliersQ = useSuppliers();
  const q = kind === 'customers' ? customersQ : suppliersQ;

  const rows = (q.data || [])
    .filter((r: any) => r.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)));

  return (
    <div className="flex flex-col gap-3">
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
            const balance = Number(r.balance || 0);
            const isOpen = openId === r.id;
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
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>{r.name}</p>
                    {r.phone && (
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.phone}</p>
                    )}
                  </div>
                  <span
                    className="font-mono text-sm font-semibold tabular-nums"
                    style={{ color: balance > 0 ? 'var(--state-warning-fg)' : 'var(--text-muted)' }}
                  >
                    {inr(balance)}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                    <LedgerDetail kind={kind} id={r.id} />
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
