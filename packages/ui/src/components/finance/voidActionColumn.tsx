import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

/**
 * Shared "Void" row action for financial ledgers (expenses, other income).
 * Corrections are never edits — an entry is voided and its ledger impact
 * reversed — so the action is hidden once a row is already `VOIDED`.
 */
export const voidActionColumn = (
  onVoid: (row: any) => void,
  title: string,
  icon: React.ReactNode,
): ColumnDef<any, any> => ({
  id: 'actions',
  header: '',
  enableSorting: false,
  cell: ({ row }) => {
    if (row.original.status === 'VOIDED')
      return <span style={{ color: 'var(--text-faint)' }}>—</span>;
    return (
      <button
        type="button"
        onClick={() => onVoid(row.original)}
        title={title}
        aria-label={title}
        style={{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          padding: '4px',
          display: 'inline-flex',
        }}
      >
        {icon}
      </button>
    );
  },
});
