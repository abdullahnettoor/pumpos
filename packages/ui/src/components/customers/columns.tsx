import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { User, Edit, Trash2 } from 'lucide-react';
import { inr } from '../../utils/format.js';
import { Chip, StatusChip, DateText } from '../../pump-ds/index.js';

/**
 * Column builders for the Customers screen tables. These are pure functions
 * (data-in → column defs) extracted from CustomersList so each table's shape
 * lives in one place and the container stays focused on orchestration.
 */

/** Account-type chip tone. */
export const typeTone = (t: string): 'info' | 'warning' | 'neutral' => (t === 'Fleet' ? 'info' : t === 'Credit' ? 'warning' : 'neutral');

/** Payment-method chip tone. */
export const methodTone = (m: string): 'brand' | 'info' | 'warning' | 'neutral' =>
  m === 'UPI' ? 'brand' : m === 'Card' || m === 'BankTransfer' ? 'info' : m === 'Credit' ? 'warning' : 'neutral';

export const methodLabel = (m: string): string => (m === 'BankTransfer' ? 'Bank' : m);

export const buildCustomerColumns = (openLedger: (c: any) => void, openEdit: (c: any) => void, showPrepaid: boolean): ColumnDef<any, any>[] => {
  const cols: ColumnDef<any, any>[] = [
  {
    accessorKey: 'name',
    header: 'Customer Name',
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={14} style={{ color: 'var(--text-muted)' }} />
          <div>
            <button type="button" onClick={() => openLedger(c)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{c.name}</button>
            {c.metadata?.tradeName && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{c.metadata.tradeName}</div>}
            {c.metadata?.gstin && <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN {c.metadata.gstin}</div>}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'customerType',
    header: 'Account Type',
    cell: ({ row }) => {
      const c = row.original;
      const t = c.customerType as string;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <Chip tone={typeTone(t)} size="xs">{t}</Chip>
          {t === 'Fleet' && c.fleetCode && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.fleetCode}</span>}
          {c.settlementCycle === 'EOD' && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>EOD settle</span>}
        </div>
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{(getValue() as string) || '—'}</span> },
  {
    accessorKey: 'creditLimit',
    header: 'Credit Limit',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      // OMC (prepaid) customers settle via the Oil Company — no station credit line.
      if (row.original.isPrepaid || limit <= 0) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const pct = Math.min(100, (balance / limit) * 100);
      const barColor = balance > limit ? 'var(--brand-danger)' : balance >= limit * 0.75 ? 'var(--brand-warning)' : 'var(--brand-primary)';
      return (
        <div style={{ width: '110px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{inr(limit)}</span>
          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--bg-surface-alt)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: '999px' }} />
          </div>
        </div>
      );
    },
  },
  ];

  if (showPrepaid) {
    cols.push(
      {
        accessorKey: 'isPrepaid',
        header: 'OMC Card',
        cell: ({ getValue }) => (getValue() ? <Chip tone="info" size="xs">OMC</Chip> : <span style={{ color: 'var(--text-faint)' }}>—</span>),
      },
    );
  }

  cols.push(
  {
    accessorKey: 'currentBalance',
    header: 'Outstanding',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      const color = limit > 0 && balance > limit ? 'var(--brand-danger)' : balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
      return <span style={{ fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{inr(balance)}</span>;
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => <StatusChip status={getValue() ? 'active' : 'inactive'} size="xs" label={getValue() ? 'Active' : 'Suspended'} />,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <button onClick={() => openEdit(row.original)} title="Edit customer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
        <Edit size={14} />
      </button>
    ),
  },
  );

  return cols;
};

export const buildCollectionColumns = (): ColumnDef<any, any>[] => [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => <DateText value={row.original.businessDate ?? row.original.createdAt} />,
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || 'Walk-in Customer'}</span>,
  },
  {
    accessorKey: 'paymentMethod',
    header: 'Method',
    cell: ({ getValue }) => {
      const m = (getValue() as string) || '';
      return m ? <Chip tone={methodTone(m)} size="xs">{methodLabel(m)}</Chip> : <span style={{ color: 'var(--text-muted)' }}>-</span>;
    },
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(getValue() as string) || '-'}</span>,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>{inr(Number(getValue() || 0))}</span>,
  },
];

export const buildCreditSaleColumns = (): ColumnDef<any, any>[] => [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => <DateText value={row.original.businessDate ?? row.original.createdAt} />,
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || 'Unknown'}</span>,
  },
  {
    accessorKey: 'productName',
    header: 'Product',
    cell: ({ getValue }) => <span style={{ color: 'var(--text-default)' }}>{(getValue() as string) || 'Merchandise'}</span>,
  },
  {
    accessorKey: 'vehicleReg',
    header: 'Vehicle',
    cell: ({ getValue }) => {
      const r = getValue() as string;
      return r ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>{r}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ getValue, row }) => {
      const q = getValue();
      return q ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(q).toLocaleString('en-IN')} {(row.original as any).unit || 'L'}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    },
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>{inr(Number(getValue() || 0))}</span>,
  },
];

export const buildVehicleColumns = (openEdit: (v: any) => void, onDelete: (v: any) => void): ColumnDef<any, any>[] => [
  {
    accessorKey: 'registrationNumber',
    header: 'Registration No.',
    cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{getValue() as string}</span>,
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{v.customerName || '—'}</span>
          {v.customerType && <Chip tone={typeTone(v.customerType)} size="xs">{v.customerType}</Chip>}
        </div>
      );
    },
  },
  { accessorKey: 'vehicleType', header: 'Vehicle Type', cell: ({ getValue }) => <span style={{ color: 'var(--text-default)' }}>{(getValue() as string) || '-'}</span> },
  {
    id: 'defaultProduct',
    header: 'Default Product',
    cell: ({ row }) => {
      const v = row.original;
      return <span style={{ color: 'var(--text-default)' }}>{v.defaultProductName ? `${v.defaultProductName} (${v.defaultProductCode || ''})` : '-'}</span>;
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => <StatusChip status={getValue() ? 'active' : 'inactive'} size="xs" />,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ getValue }) => <DateText value={getValue() as string} tone="muted" />,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div style={{ display: 'flex', gap: '2px' }}>
        <button onClick={() => openEdit(row.original)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }} title="Edit vehicle">
          <Edit size={14} />
        </button>
        <button onClick={() => onDelete(row.original)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-danger)', padding: '4px' }} title="Delete vehicle">
          <Trash2 size={14} />
        </button>
      </div>
    ),
  },
];
