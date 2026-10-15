import React from 'react';
import type { DecantationReportProductTotal, DecantationReportTotals } from '@pump/shared';
import {
  InteractiveTable,
  KpiStrip,
  KpiTile,
  VarianceChip,
  type TableColumn,
} from '../../../pump-ds/index.js';
import { formatQuantity } from '../../../utils/format.js';
import { litres } from './vocabulary.js';

const varianceWord = (v: number): string =>
  v < 0 ? 'station decantation loss' : v > 0 ? 'station decantation excess' : 'exact match';

/**
 * The report's four headline figures, all server-composed and all following
 * the range. Volume received is not a tile: it is the total of the visits
 * table below.
 */
export const DecantationSummary: React.FC<{ totals: DecantationReportTotals }> = ({
  totals: t,
}) => (
  <KpiStrip columns="auto">
    <KpiTile
      label="Tanker visits"
      value={String(t.totalVisits)}
      hint={`${t.measuredVisits} measured · ${t.pendingVisits} pending`}
    />
    <KpiTile
      label="Settled invoice volume"
      value={litres(t.totalInvoiceQty)}
      hint={`${litres(t.pendingInvoiceQty)} pending · ${t.settlingInvoiceCount} settling`}
    />
    <KpiTile
      alert={t.totalVarianceQty < 0 ? 'danger' : undefined}
      label="Settled invoice variance"
      value={formatQuantity(t.totalVarianceQty, 'L', { plus: true })}
      hint={varianceWord(t.totalVarianceQty)}
    />
    <KpiTile
      alert={t.transitDiscrepancies > 0 ? 'danger' : undefined}
      label="Transit discrepancies"
      value={String(t.transitDiscrepancies)}
      hint={`${t.totalChambersShort} short · ${t.totalChambersExcess} excess · ${t.totalSealsBroken} broken seals · ${t.totalChambersNotEmptied} unemptied`}
    />
  </KpiStrip>
);

const pendingText = (p: DecantationReportProductTotal): string | null =>
  p.pendingReceivedQty > 0 || p.pendingInvoiceQty > 0
    ? `${litres(p.pendingReceivedQty)} received · ${litres(p.pendingInvoiceQty)} invoiced`
    : null;

const visitsText = (p: DecantationReportProductTotal): string =>
  `${p.visitCount} ${p.visitCount === 1 ? 'visit' : 'visits'} · ${p.measuredLineCount} measured` +
  (p.pendingLineCount > 0 ? ` · ${p.pendingLineCount} pending` : '');

const PRODUCT_COLUMNS: TableColumn<DecantationReportProductTotal>[] = [
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (p) => p.productName,
    cell: (p) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-ink-strong">{p.productName}</span>
        <span className="text-[12px] text-ink-muted">{p.productCode}</span>
      </span>
    ),
    width: '16%',
  },
  {
    id: 'received',
    header: 'Received (settled)',
    kind: 'qty',
    unit: 'L',
    value: (p) => p.settledReceivedQty,
  },
  {
    id: 'invoiced',
    header: 'Invoiced (settled)',
    kind: 'qty',
    unit: 'L',
    value: (p) => p.totalInvoiceQty,
  },
  {
    id: 'variance',
    header: 'Net variance',
    kind: 'qty',
    unit: 'L',
    value: (p) => p.totalVarianceQty,
    cell: (p) => <VarianceChip amount={p.totalVarianceQty} kind="stock" size="md" />,
  },
  {
    id: 'short',
    header: 'Short',
    kind: 'qty',
    unit: 'L',
    value: (p) => (p.shortVarianceQty > 0 ? -p.shortVarianceQty : null),
    cell: (p) =>
      p.shortVarianceQty > 0 ? (
        <span className="whitespace-nowrap">{formatQuantity(-p.shortVarianceQty, 'L')}</span>
      ) : (
        '—'
      ),
  },
  {
    id: 'excess',
    header: 'Excess',
    kind: 'qty',
    unit: 'L',
    value: (p) => (p.excessVarianceQty > 0 ? p.excessVarianceQty : null),
    cell: (p) =>
      p.excessVarianceQty > 0 ? (
        <span className="whitespace-nowrap">
          {formatQuantity(p.excessVarianceQty, 'L', { plus: true })}
        </span>
      ) : (
        '—'
      ),
  },
  { id: 'pending', header: 'Not yet settled', kind: 'text', value: pendingText },
  { id: 'visits', header: 'Visits', kind: 'text', value: visitsText },
];

/**
 * Settled figures per product. No total row: the tiles above are its totals,
 * across products.
 */
export const DecantationProductTotals: React.FC<{ products: DecantationReportProductTotal[] }> = ({
  products,
}) => (
  <InteractiveTable
    bare
    columns={PRODUCT_COLUMNS}
    rows={products}
    rowKey={(p) => p.productId}
    title="totals by product"
  />
);
