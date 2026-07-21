import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { inr } from '../../utils/format.js';
import { Chip, DateText } from '../../pump-ds/index.js';

export const RECEIVED_INTO: Record<string, { label: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SHIFT_CASH: { label: 'Cash · drawer', tone: 'warning' },
  BANK: { label: 'Bank', tone: 'info' },
  OWNER: { label: 'Owner', tone: 'neutral' },
};

const dateCell = (row: any) => <DateText value={row.original.businessDate ?? row.original.shiftDate} />;

const receivedIntoCell = (value: string) => {
  const cfg = RECEIVED_INTO[value] ?? { label: value ?? '—', tone: 'neutral' as const };
  return <Chip tone={cfg.tone} size="xs">{cfg.label}</Chip>;
};

const amountCell = (row: any, getValue: () => any) => {
  const voided = row.original.status === 'VOIDED';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontWeight: 700, color: voided ? 'var(--text-faint)' : 'var(--brand-success)', fontFamily: 'var(--font-mono)', textDecoration: voided ? 'line-through' : undefined }}>
        {inr(getValue())}
      </span>
      {voided && <Chip tone="neutral" size="xs">Voided</Chip>}
      {row.original.status === 'ADJUSTMENT' && <Chip tone="warning" size="xs">Adjustment</Chip>}
    </span>
  );
};

/** Full income ledger columns incl. Received Into — shared by the Ledger tab and the register. */
export const incomeColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'businessDate', header: 'Business Day', cell: ({ row }) => dateCell(row) },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) ?? 'Other Income'}</span> },
  { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'receivedInto', header: 'Received Into', cell: ({ getValue }) => receivedIntoCell(getValue() as string) },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row, getValue }) => amountCell(row, getValue) },
];
