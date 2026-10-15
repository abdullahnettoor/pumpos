import React from 'react';
import type { DecantationReportInvoice } from '@pump/shared';
import {
  InteractiveTable,
  StatusChip,
  VarianceChip,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { invoiceState } from './vocabulary.js';

const COLUMNS: TableColumn<DecantationReportInvoice>[] = [
  {
    id: 'invoice',
    header: 'Invoice',
    kind: 'text',
    emphasis: true,
    value: (i) => i.invoiceNumber || i.purchaseDocumentNumber,
  },
  { id: 'supplier', header: 'Supplier', kind: 'text', value: (i) => i.supplierName },
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (i) => i.productName,
    cell: (i) => (
      <span className="flex flex-col leading-tight">
        <span className="text-ink-strong">{i.productName}</span>
        <span className="text-[12px] text-ink-muted">{i.productCode}</span>
      </span>
    ),
  },
  { id: 'invoiceQty', header: 'Invoice qty', kind: 'qty', unit: 'L', value: (i) => i.invoiceQty },
  {
    id: 'received',
    header: 'Received (all visits)',
    kind: 'qty',
    unit: 'L',
    value: (i) => i.receivedQty,
  },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'qty',
    unit: 'L',
    value: (i) => i.varianceQty,
    cell: (i) => {
      const waiting = invoiceState(i);
      if (waiting) return <StatusChip status={waiting.status} label={waiting.label} size="md" />;
      return i.varianceQty == null ? (
        '—'
      ) : (
        <VarianceChip amount={i.varianceQty} kind="stock" size="md" />
      );
    },
  },
  {
    id: 'visits',
    header: 'Visits',
    kind: 'text',
    value: (i) => i.visits.map((v) => v.documentNumber).join(', '),
    cell: (i) => (
      <span className="font-mono text-[12px] text-ink-muted">
        {i.visits.map((v) => v.documentNumber).join(', ')}
      </span>
    ),
  },
];

/**
 * One row per invoice (purchase + product), however many visits it is split
 * across. No total row: a settling invoice has no received figure yet, so a
 * column sum would mix settled and unsettled invoices; the settled totals are
 * the tiles above.
 */
export const DecantationInvoicesTable: React.FC<{ invoices: DecantationReportInvoice[] }> = ({
  invoices,
}) => (
  <div data-testid="decantation-invoices-table">
    <InteractiveTable
      bare
      columns={COLUMNS}
      rows={invoices}
      rowKey={(i) => `${i.purchaseId}:${i.productId}`}
      title="invoices"
    />
  </div>
);
