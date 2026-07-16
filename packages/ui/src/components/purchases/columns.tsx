import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building, Edit } from 'lucide-react';
import { inr } from '../../utils/format.js';
import { StatusChip, DateText } from '../../pump-ds/index.js';

/** Column builders for the Purchases screen tables (extracted from PurchasesList). */

export const purchaseColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => <DateText value={row.original.businessDate ?? row.original.shiftDate} />,
  },
  { accessorKey: 'supplierName', header: 'Supplier', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || '—'}</span> },
  {
    accessorKey: 'itemsSummary',
    header: 'Items',
    cell: ({ row }) => {
      const s = row.original.itemsSummary as string | null;
      const n = Number(row.original.itemCount || 0);
      if (!s) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      return (
        <span title={s} style={{ display: 'inline-block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text-default)', fontSize: '12px' }}>
          {s}{n > 1 ? <span style={{ color: 'var(--text-muted)' }}> · {n} lines</span> : null}
        </span>
      );
    },
  },
  { accessorKey: 'documentNumber', header: 'Reference', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'invoiceNumber', header: 'Invoice', cell: ({ getValue }) => <span style={{ color: 'var(--text-strong)' }}>{(getValue() as string) || '--'}</span> },
  { accessorKey: 'notes', header: 'Notes', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '--'}</span> },
  {
    accessorKey: 'amount',
    header: 'Total Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{inr(getValue())}</span>,
  },
];

export const buildSupplierColumns = (openLedger: (s: any) => void, openEdit: (s: any) => void): ColumnDef<any, any>[] => [
  {
    accessorKey: 'name',
    header: 'Supplier Name',
    cell: ({ row }) => {
      const sup = row.original;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building size={14} style={{ color: 'var(--text-muted)' }} />
          <div>
            <button type="button" onClick={() => openLedger(sup)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{sup.name}</button>
            {sup.metadata?.tradeName && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{sup.metadata.tradeName}</div>}
            {sup.metadata?.gstin && <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN {sup.metadata.gstin}</div>}
          </div>
        </div>
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => <StatusChip status={getValue() ? 'active' : 'inactive'} size="xs" label={getValue() ? 'Active' : 'Suspended'} />,
  },
  {
    accessorKey: 'currentBalance',
    header: 'Outstanding',
    cell: ({ getValue }) => {
      const bal = Number(getValue() || 0);
      return <span style={{ fontWeight: 700, color: bal > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>{inr(bal)}</span>;
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <button onClick={() => openEdit(row.original)} title="Edit supplier" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
        <Edit size={14} />
      </button>
    ),
  },
];
