import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DecantationReportInvoice } from '@pump/shared';
import { Chip, Panel } from '../../../pump-ds/index.js';
import { DataTable } from '../../primitives/DataTable.js';
import { litres, signedLitres, varianceColor } from './styles.js';

const columns: ColumnDef<DecantationReportInvoice, any>[] = [
  {
    header: 'Invoice',
    id: 'invoice',
    cell: ({ row }) => row.original.invoiceNumber || row.original.purchaseDocumentNumber || '—',
  },
  { header: 'Supplier', id: 'supplier', cell: ({ row }) => row.original.supplierName ?? '—' },
  {
    header: 'Product',
    id: 'product',
    cell: ({ row }) => `${row.original.productName} (${row.original.productCode})`,
  },
  { header: 'Invoice Qty', id: 'invoiceQty', cell: ({ row }) => litres(row.original.invoiceQty) },
  {
    header: 'Received (all visits)',
    id: 'received',
    cell: ({ row }) => litres(row.original.receivedQty),
  },
  {
    header: 'Variance',
    id: 'variance',
    cell: ({ row }) => (
      <span style={{ fontWeight: 600, color: varianceColor(row.original.varianceQty) }}>
        {signedLitres(row.original.varianceQty)}
      </span>
    ),
  },
  {
    header: 'Status',
    id: 'status',
    cell: ({ row }) => {
      const i = row.original;
      const tone =
        i.status === 'SETTLING'
          ? 'warning'
          : i.varianceType === 'SHORT'
            ? 'danger'
            : i.varianceType === 'EXCESS'
              ? 'success'
              : 'neutral';
      return (
        <Chip size="xs" tone={tone} variant="soft">
          {i.statusLabel}
        </Chip>
      );
    },
  },
  {
    header: 'Visits',
    id: 'visits',
    cell: ({ row }) => row.original.visits.map((v) => v.documentNumber).join(', '),
  },
];

/** One row per invoice (purchase + product), however many visits it is split across. */
export const DecantationInvoicesTable: React.FC<{ invoices: DecantationReportInvoice[] }> = ({
  invoices,
}) => {
  if (invoices.length === 0) return null;
  return (
    <Panel flush title={`Invoices (${invoices.length})`}>
      <div data-testid="decantation-invoices-table">
        <DataTable
          bare
          dense
          columns={columns}
          data={invoices}
          getRowId={(r) => `${r.purchaseId}:${r.productId}`}
        />
      </div>
    </Panel>
  );
};
