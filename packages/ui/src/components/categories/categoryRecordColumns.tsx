import React from 'react';
import { Button, Icon, StatusChip, type TableColumn } from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';
import type { CategoryRecordKind } from './CategoryManagerDrawer.js';

/** An Expense or Income entry as the ledger lists it. */
export interface CategoryRecord {
  id: string;
  entryDate?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  description?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  amount: number | string;
  status?: string | null;
}

export const isVoided = (r: CategoryRecord) => r.status === 'VOIDED';

/** Money out reads in the danger tone, money in in the success tone. */
export const AMOUNT_TONE: Record<CategoryRecordKind, string> = {
  expense: 'text-danger-fg',
  income: 'text-success-fg',
};

export const FALLBACK_CATEGORY: Record<CategoryRecordKind, string> = {
  expense: 'General',
  income: 'Other Income',
};

const VOID_LABEL: Record<CategoryRecordKind, string> = {
  expense: 'Void expense',
  income: 'Void income entry',
};

/** Funding Account the money moved through, with its type as secondary text. */
const AccountCell: React.FC<{ row: CategoryRecord }> = ({ row }) => {
  if (!row.accountName) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-ink-strong">{row.accountName}</span>
      {row.accountType && (
        <span className="text-[12px] text-ink-muted">{accountTypeLabel(row.accountType)}</span>
      )}
    </span>
  );
};

/**
 * The amount in the kind's tone; a voided entry is struck and faint. The
 * status sits before the figure so every figure lines up on the right.
 */
const AmountCell: React.FC<{ kind: CategoryRecordKind; row: CategoryRecord }> = ({ kind, row }) => {
  const voided = isVoided(row);
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {voided && <StatusChip status="voided" size="xs" className="font-sans" />}
      {row.status === 'ADJUSTMENT' && (
        <StatusChip status="adjustment" size="xs" className="font-sans" />
      )}
      <span className={voided ? 'text-ink-faint line-through' : AMOUNT_TONE[kind]}>
        {formatMoney(row.amount)}
      </span>
    </span>
  );
};

/**
 * The ledger columns Expenses and Income share (Table module): entry date,
 * category, description, Funding Account, amount. Pass `onVoid` for roles
 * that may void; a voided row has nothing left to void.
 */
export function buildCategoryRecordColumns(
  kind: CategoryRecordKind,
  onVoid?: (row: CategoryRecord) => void,
): TableColumn<CategoryRecord>[] {
  const columns: TableColumn<CategoryRecord>[] = [
    {
      id: 'entryDate',
      header: 'Entry date',
      kind: 'date',
      value: (r) => r.entryDate,
      width: '15%',
    },
    {
      id: 'category',
      header: 'Category',
      kind: 'text',
      emphasis: true,
      value: (r) => r.categoryName ?? FALLBACK_CATEGORY[kind],
      width: '18%',
    },
    {
      id: 'description',
      header: 'Description',
      kind: 'text',
      value: (r) => r.description,
      cell: (r) => <span className="text-ink-muted">{r.description || '—'}</span>,
    },
    {
      id: 'account',
      header: 'Funding account',
      kind: 'text',
      value: (r) => r.accountName,
      cell: (r) => <AccountCell row={r} />,
      width: '16%',
    },
    {
      id: 'amount',
      header: 'Amount',
      kind: 'money',
      value: (r) => r.amount,
      cell: (r) => <AmountCell kind={kind} row={r} />,
      width: '20%',
    },
  ];
  if (!onVoid) return columns;
  return [
    ...columns,
    {
      id: 'actions',
      header: '',
      kind: 'text',
      value: () => null,
      width: '6%',
      cell: (r) =>
        isVoided(r) ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            title={VOID_LABEL[kind]}
            aria-label={VOID_LABEL[kind]}
            onClick={() => onVoid(r)}
          >
            <Icon name="ban" size="xs" />
          </Button>
        ),
    },
  ];
}
