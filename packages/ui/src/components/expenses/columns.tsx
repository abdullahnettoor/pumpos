import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Calendar } from 'lucide-react';
import { inr } from '../../utils/format.js';
import { Chip } from '../../pump-ds/index.js';

export const PAID_FROM: Record<string, { label: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SHIFT_CASH: { label: 'Cash · drawer', tone: 'warning' },
  BANK: { label: 'Bank', tone: 'info' },
  OWNER: { label: 'Owner', tone: 'neutral' },
};

const dateCell = (row: any) => {
  const d = row.original.businessDate ?? row.original.shiftDate;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-default)' }}>
      <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
      {d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
    </span>
  );
};

const paidFromCell = (value: string) => {
  const cfg = PAID_FROM[value] ?? { label: value ?? '—', tone: 'neutral' as const };
  return <Chip tone={cfg.tone} size="xs">{cfg.label}</Chip>;
};

const amountCell = (row: any, getValue: () => any) => {
  const voided = row.original.status === 'VOIDED';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontWeight: 700, color: voided ? 'var(--text-faint)' : 'var(--brand-danger)', fontFamily: 'var(--font-mono)', textDecoration: voided ? 'line-through' : undefined }}>
        {inr(getValue())}
      </span>
      {voided && <Chip tone="neutral" size="xs">Voided</Chip>}
      {row.original.status === 'ADJUSTMENT' && <Chip tone="warning" size="xs">Adjustment</Chip>}
    </span>
  );
};

/** Full expense ledger columns incl. Paid From — shared by the Ledger tab and the register. */
export const expenseColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'businessDate', header: 'Business Day', cell: ({ row }) => dateCell(row) },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) ?? 'General'}</span> },
  { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'paidFrom', header: 'Paid From', cell: ({ getValue }) => paidFromCell(getValue() as string) },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row, getValue }) => amountCell(row, getValue) },
];
