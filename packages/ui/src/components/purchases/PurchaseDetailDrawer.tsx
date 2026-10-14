import React, { useMemo } from 'react';
import { Drawer } from '../Drawer.js';
import {
  DataSection,
  InteractiveTable,
  SectionHeader,
  StatusChip,
  type TableColumn,
} from '../../pump-ds/index.js';
import { usePurchaseItems } from '../../query/hooks.js';
import { formatDate, formatMoney, formatQuantity } from '../../utils/format.js';
import { isAwaitingDecantation, purchaseDate, type PurchaseRow } from './columns.js';

/** A purchase as its invoice reads: the list row plus its tax totals. */
export interface PurchaseDetail extends PurchaseRow {
  taxableAmount?: number | string | null;
  cgstTotal?: number | string | null;
  sgstTotal?: number | string | null;
  igstTotal?: number | string | null;
  cessTotal?: number | string | null;
}

/** One invoice line (`GET /transactions/purchases/:id/items`). */
interface PurchaseItem {
  id: string;
  productName: string;
  productCode?: string | null;
  quantity: number | string;
  unit?: string | null;
  unitPrice: number | string;
  taxableAmount: number | string;
  cgst?: number | string | null;
  sgst?: number | string | null;
  igst?: number | string | null;
  vat?: number | string | null;
  cess?: number | string | null;
  taxCategory?: string | null;
  gstRate?: number | string | null;
  lineTotal: number | string;
}

const figure = (v: number | string | null | undefined) => Number(v || 0);

const taxOf = (it: PurchaseItem) =>
  figure(it.cgst) + figure(it.sgst) + figure(it.igst) + figure(it.vat) + figure(it.cess);

/** A line with no tax figure says why: its GST rate, or fuel VAT inside the price. */
const taxNote = (it: PurchaseItem) =>
  it.taxCategory === 'GST'
    ? `${figure(it.igst) > 0 ? 'IGST' : 'GST'} ${figure(it.gstRate)}%`
    : it.taxCategory === 'FUEL_VAT'
      ? 'Incl. VAT'
      : '—';

/** A rate keeps up to 4 decimals (fuel is priced to the paisa per litre and finer). */
const rateText = (v: number | string) => {
  const places = (String(v).split('.')[1] ?? '').replace(/0+$/, '').length;
  return formatMoney(v, { decimals: Math.min(4, Math.max(2, places)) });
};

const ITEM_COLUMNS: TableColumn<PurchaseItem>[] = [
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (it) => it.productName,
    width: '28%',
    cell: (it) => (
      <span className="inline-flex flex-col leading-tight">
        <span className="font-semibold text-ink-strong">{it.productName}</span>
        {it.productCode && (
          <span className="font-mono text-[12px] text-ink-muted">{it.productCode}</span>
        )}
      </span>
    ),
  },
  {
    id: 'qty',
    header: 'Qty',
    kind: 'qty',
    value: (it) => it.quantity,
    unit: (it) => it.unit,
    width: '13%',
    cell: (it) => <span className="whitespace-nowrap">{formatQuantity(it.quantity, it.unit)}</span>,
  },
  {
    id: 'rate',
    header: 'Rate',
    kind: 'money',
    total: false,
    value: (it) => it.unitPrice,
    cell: (it) => rateText(it.unitPrice),
  },
  { id: 'taxable', header: 'Taxable', kind: 'money', value: (it) => it.taxableAmount },
  {
    id: 'tax',
    header: 'Tax',
    kind: 'money',
    value: (it) => taxOf(it),
    cell: (it) =>
      taxOf(it) > 0 ? (
        formatMoney(taxOf(it))
      ) : (
        <span className="font-sans text-ink-muted">{taxNote(it)}</span>
      ),
  },
  {
    id: 'total',
    header: 'Total',
    kind: 'money',
    value: (it) => it.lineTotal,
    cell: (it) => <span className="text-ink-strong">{formatMoney(it.lineTotal)}</span>,
  },
];

const Fact: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  children,
  mono,
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-[12px] text-ink-muted">{label}</dt>
    <dd className={mono ? 'truncate font-mono text-ink-strong' : 'truncate text-ink-strong'}>
      {children}
    </dd>
  </div>
);

const TaxLine: React.FC<{ label: string; value: number; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div
    className={
      strong
        ? 'mt-1 flex justify-between border-t border-border-soft pt-2 font-semibold text-ink-strong'
        : 'flex justify-between text-ink-muted'
    }
  >
    <span className="font-sans">{label}</span>
    <span className="font-mono tabular-nums">{formatMoney(value)}</span>
  </div>
);

export interface PurchaseDetailDrawerProps {
  /** The purchase to show; null closes the drawer. */
  purchase: PurchaseDetail | null;
  onClose: () => void;
}

/**
 * One purchase invoice: who, when, which reference; its lines (Table module)
 * and its tax totals. Lines load in their own Data Section, cached by
 * `usePurchaseItems`.
 */
export const PurchaseDetailDrawer: React.FC<PurchaseDetailDrawerProps> = ({
  purchase,
  onClose,
}) => {
  const itemsQ = usePurchaseItems(purchase?.id ?? null);
  const items = useMemo<PurchaseItem[]>(() => itemsQ.data ?? [], [itemsQ.data]);
  const p = purchase;

  return (
    <Drawer isOpen={p !== null} onClose={onClose} title="Purchase invoice" widthVariant="wide">
      {p && (
        <div className="flex flex-col gap-5 text-[13px]">
          <div className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface-alt p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Supplier">{p.supplierName || '—'}</Fact>
              <Fact label="Date">{formatDate(purchaseDate(p))}</Fact>
              <Fact label="Supplier invoice">{p.invoiceNumber || '—'}</Fact>
              <Fact label="Reference" mono>
                {p.documentNumber || '—'}
              </Fact>
            </dl>
            {isAwaitingDecantation(p) && (
              <div>
                <StatusChip status="awaiting-decantation" size="xs" />
              </div>
            )}
          </div>

          <section className="flex flex-col gap-2">
            <SectionHeader title="Line items" />
            <DataSection
              title="line items"
              query={itemsQ}
              enabled
              placeholderHeight={120}
              flush
              isEmpty={items.length === 0}
              empty={
                <p className="p-3 text-[13px] text-ink-muted">
                  No line items recorded for this purchase.
                </p>
              }
            >
              <InteractiveTable
                bare
                columns={ITEM_COLUMNS}
                rows={items}
                rowKey={(it) => it.id}
                totalRow
                title="line items"
              />
            </DataSection>
          </section>

          <div className="flex flex-col gap-1 rounded-card border border-border-soft bg-surface-alt px-4 py-3 text-[12px]">
            <TaxLine label="Taxable" value={figure(p.taxableAmount)} />
            {figure(p.cgstTotal) > 0 && (
              <TaxLine label="CGST + SGST" value={figure(p.cgstTotal) + figure(p.sgstTotal)} />
            )}
            {figure(p.igstTotal) > 0 && <TaxLine label="IGST" value={figure(p.igstTotal)} />}
            {figure(p.cessTotal) > 0 && <TaxLine label="Cess" value={figure(p.cessTotal)} />}
            <TaxLine label="Invoice total" value={figure(p.amount)} strong />
          </div>

          {p.notes && (
            <p className="text-[12px] text-ink-muted">
              <span className="font-semibold text-ink-default">Notes: </span>
              {p.notes}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
};
