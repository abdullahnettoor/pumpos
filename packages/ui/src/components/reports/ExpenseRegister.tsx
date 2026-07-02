import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { resolveBusinessDate } from '@pump/shared';
import { useExpenses } from '../../query/hooks.js';
import { DataTable } from '../primitives/DataTable.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { DateField } from '../primitives/Field.js';
import { inr } from '../../utils/format.js';
import { Calendar } from 'lucide-react';

const PAID_FROM_LABEL: Record<string, string> = {
  SHIFT_CASH: 'Cash (drawer)',
  BANK: 'Bank',
  OWNER: 'Owner',
};

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'businessDate',
    header: 'Business Day',
    cell: ({ row }) => {
      const d = row.original.businessDate ?? row.original.shiftDate;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-default)' }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          {d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
        </span>
      );
    },
  },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) ?? 'General'}</span> },
  { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'paidFrom', header: 'Paid From', cell: ({ getValue }) => <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{PAID_FROM_LABEL[getValue() as string] ?? (getValue() as string) ?? '—'}</span> },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => (
      <span style={{ fontWeight: 700, color: 'var(--brand-danger)', fontFamily: 'var(--font-mono)' }}>{inr(getValue())}</span>
    ),
  },
];

export interface ExpenseRegisterProps {
  selectedStation: any | null;
}

/**
 * Expense register (Phase L4): category-grouped view of expenses over a
 * business-date range, with KPIs and a full ledger table. Client-side over the
 * cached expenses (VOIDED excluded); no new backend.
 */
export const ExpenseRegister: React.FC<ExpenseRegisterProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const today = resolveBusinessDate({ timeZone: s.timezone, dayStartsAt: s.business_day_starts_at });
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);

  const { data: expenses, isLoading, error } = useExpenses();

  const filtered = useMemo(
    () =>
      (expenses || []).filter((e: any) => {
        if (e.status === 'VOIDED') return false;
        const d = e.businessDate ?? e.shiftDate;
        return d && d >= from && d <= to;
      }),
    [expenses, from, to],
  );

  const total = filtered.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    for (const e of filtered) {
      const name = e.categoryName || 'General';
      const c = m.get(name) || { name, total: 0, count: 0 };
      c.total += Number(e.amount || 0);
      c.count += 1;
      m.set(name, c);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="field-label">From</label>
          <DateField value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="field-label">To</label>
          <DateField value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <KpiCard label="Total Expenses" value={inr(total)} tone="danger" />
        <KpiCard label="Entries" value={filtered.length} />
        <KpiCard label="Categories" value={byCategory.length} />
        <KpiCard label="Largest Category" value={byCategory[0] ? inr(byCategory[0].total) : inr(0)} sub={byCategory[0]?.name ?? '—'} mono={false} />
      </div>

      <div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Category</span>
        <div className="card" style={{ marginTop: '10px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {byCategory.length === 0 ? (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No expenses in this range.</span>
          ) : (
            byCategory.map((c) => {
              const pct = total > 0 ? (c.total / total) * 100 : 0;
              return (
                <div key={c.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
                      {c.name} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>· {c.count}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                      {inr(c.total)} <span style={{ color: 'var(--text-faint)' }}>· {pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface-alt)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-danger)' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        error={error as Error | null}
        emptyMessage="No expenses in this range."
        initialSorting={[{ id: 'businessDate', desc: true }]}
      />
    </div>
  );
};
