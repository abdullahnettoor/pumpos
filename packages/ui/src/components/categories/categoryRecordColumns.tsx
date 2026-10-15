import React from 'react';
import { Button, Icon, StatusChip, type TableColumn } from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { accountTypeDetail as accountTypeDetailFor } from '../../utils/ledgerLabels.js';
import { AccountTypeChip } from '../finance/AccountTypeChip.js';
import type { CategoryRecordKind } from './CategoryManagerDrawer.js';
import type { WriteEntry } from '../../query/pendingWrites.js';

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
  /** A save or void in flight, or a refused void (#606). */
  write?: WriteEntry<unknown>;
  /** A row for an entry still saving: no figure until the server confirms it. */
  unsaved?: boolean;
}

export const isVoided = (r: CategoryRecord) => r.status === 'VOIDED';

export const FALLBACK_CATEGORY: Record<CategoryRecordKind, string> = {
  expense: 'General',
  income: 'Other Income',
};

const VOID_LABEL: Record<CategoryRecordKind, string> = {
  expense: 'Void expense',
  income: 'Void income entry',
};

/**
 * The Funding Account's type beside its name, unless the name is exactly the
 * type: "SBI Current · Bank", "Bank of Baroda · Bank", "Owner Account · Owner",
 * never "Cash in Hand · Cash in Hand" (#530).
 */
export function accountTypeDetail(row: Pick<CategoryRecord, 'accountName' | 'accountType'>) {
  return accountTypeDetailFor(row.accountName, row.accountType);
}

/** Funding Account the money moved through, with its type chip (#530). */
const AccountCell: React.FC<{ row: CategoryRecord }> = ({ row }) => {
  if (!row.accountName) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="text-ink-strong">{row.accountName}</span>
      {accountTypeDetail(row) && <AccountTypeChip type={row.accountType} />}
    </span>
  );
};

/**
 * The amount in plain text (ordinary money is never coloured); a voided entry
 * is struck and faint. The status sits before the figure so every figure lines
 * up on the right.
 */
const AmountCell: React.FC<{ row: CategoryRecord }> = ({ row }) => {
  const voided = isVoided(row);
  const saving = row.write?.state === 'saving';
  // A new entry still saving shows no amount until the server confirms it (#606).
  if (row.unsaved) return <StatusChip status="saving" size="sm" className="font-sans" />;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {saving && <StatusChip status="saving" size="sm" className="font-sans" />}
      {voided && <StatusChip status="voided" size="xs" className="font-sans" />}
      {row.status === 'ADJUSTMENT' && (
        <StatusChip status="adjustment" size="xs" className="font-sans" />
      )}
      <span className={voided ? 'text-ink-faint line-through' : 'text-ink-strong'}>
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
      cell: (r) =>
        r.write?.state === 'failed' ? (
          <span className="flex flex-col">
            <span className="text-ink-muted">{r.description || '—'}</span>
            <span role="alert" className="text-[12px] text-danger-fg">
              Not voided: {r.write.error?.message || 'the server refused it'}
            </span>
          </span>
        ) : (
          <span className="text-ink-muted">{r.description || '—'}</span>
        ),
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
      cell: (r) => <AmountCell row={r} />,
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
        isVoided(r) || r.unsaved || r.write?.state === 'saving' ? (
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
