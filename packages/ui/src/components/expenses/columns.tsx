import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { inr } from '../../utils/format.js';
import { Chip, DateText, Icon } from '../../pump-ds/index.js';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';
import { voidActionColumn } from '../finance/voidActionColumn.js';

const dateCell = (row: any) => <DateText value={row.original.entryDate} />;

/** Funding Account the money moved through, with its type as secondary text. */
const accountCell = (row: any) => {
  const { accountName, accountType } = row.original;
  if (!accountName) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}>
      <span style={{ color: 'var(--text-strong)' }}>{accountName}</span>
      {accountType && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {accountTypeLabel(accountType)}
        </span>
      )}
    </span>
  );
};

const amountCell = (row: any, getValue: () => any) => {
  const voided = row.original.status === 'VOIDED';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          fontWeight: 700,
          color: voided ? 'var(--text-faint)' : 'var(--brand-danger)',
          fontFamily: 'var(--font-mono)',
          textDecoration: voided ? 'line-through' : undefined,
        }}
      >
        {inr(getValue())}
      </span>
      {voided && (
        <Chip tone="neutral" size="xs">
          Voided
        </Chip>
      )}
      {row.original.status === 'ADJUSTMENT' && (
        <Chip tone="warning" size="xs">
          Adjustment
        </Chip>
      )}
    </span>
  );
};

const baseColumns: ColumnDef<any, any>[] = [
  { accessorKey: 'entryDate', header: 'Entry Date', cell: ({ row }) => dateCell(row) },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ getValue }) => (
      <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
        {(getValue() as string) ?? 'General'}
      </span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ getValue }) => (
      <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span>
    ),
  },
  {
    accessorKey: 'accountName',
    header: 'Account',
    cell: ({ row }) => accountCell(row),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row, getValue }) => amountCell(row, getValue),
  },
];

/** Full expense ledger columns incl. Account — shared by the Ledger tab and the register. */
export const expenseColumns: ColumnDef<any, any>[] = baseColumns;

/**
 * Ledger columns with a Void row action. `onVoid` is omitted (or `canVoid` is
 * false) for roles that may not void, in which case the plain columns are used.
 */
export const buildExpenseColumns = (onVoid?: (row: any) => void): ColumnDef<any, any>[] =>
  onVoid
    ? [...baseColumns, voidActionColumn(onVoid, 'Void expense', <Icon name="ban" size="xs" />)]
    : baseColumns;
