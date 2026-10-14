import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { inr } from '../../utils/format.js';
import { Chip, DateText, Icon } from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';
import { voidActionColumn } from '../finance/voidActionColumn.js';
import type { CategoryRecordKind } from './CategoryManagerDrawer.js';

const dateCell = (row: any) => <DateText value={row.original.entryDate} />;

/** Funding Account the money moved through, with its type as secondary text. */
const accountCell = (row: any) => {
  const { accountName, accountType } = row.original;
  if (!accountName) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-ink-strong">{accountName}</span>
      {accountType && (
        <span className="text-[12px] text-ink-muted">{accountTypeLabel(accountType)}</span>
      )}
    </span>
  );
};

/** Money out reads in the danger tone, money in in the success tone. */
const AMOUNT_TONE: Record<CategoryRecordKind, string> = {
  expense: 'text-danger-fg',
  income: 'text-success-fg',
};

const amountCell = (kind: CategoryRecordKind, row: any, getValue: () => any) => {
  const voided = row.original.status === 'VOIDED';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'font-mono font-bold tabular-nums',
          voided ? 'text-ink-faint line-through' : AMOUNT_TONE[kind],
        )}
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

const FALLBACK_CATEGORY: Record<CategoryRecordKind, string> = {
  expense: 'General',
  income: 'Other Income',
};

const VOID_LABEL: Record<CategoryRecordKind, string> = {
  expense: 'Void expense',
  income: 'Void income entry',
};

/**
 * The ledger columns Expenses and Income share: entry date, category,
 * description, Funding Account, amount. Pass `onVoid` for roles that may void.
 */
export function buildCategoryRecordColumns(
  kind: CategoryRecordKind,
  onVoid?: (row: any) => void,
): ColumnDef<any, any>[] {
  const columns: ColumnDef<any, any>[] = [
    { accessorKey: 'entryDate', header: 'Entry Date', cell: ({ row }) => dateCell(row) },
    {
      accessorKey: 'categoryName',
      header: 'Category',
      cell: ({ getValue }) => (
        <span className="font-semibold text-ink-strong">
          {(getValue() as string) ?? FALLBACK_CATEGORY[kind]}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ getValue }) => (
        <span className="text-ink-muted">{(getValue() as string) || '—'}</span>
      ),
    },
    {
      accessorKey: 'accountName',
      header: 'Funding account',
      cell: ({ row }) => accountCell(row),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row, getValue }) => amountCell(kind, row, getValue),
    },
  ];
  return onVoid
    ? [...columns, voidActionColumn(onVoid, VOID_LABEL[kind], <Icon name="ban" size="xs" />)]
    : columns;
}
