import React from 'react';
import { partyState } from '@pump/shared';
import { Button, Icon, StatusChip, type TableColumn } from '../../pump-ds/index.js';
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { formatMoney } from '../../utils/format.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { accountTypeDetail } from '../categories/categoryRecordColumns.js';

/** Column builders for the Suppliers page tables (Table module, #524). */

/** A purchase as the Purchases ledger lists it (`GET /transactions/purchases`). */
export interface PurchaseRow {
  id: string;
  stationId?: string | null;
  businessDayId?: string | null;
  awaitingDecantation?: boolean;
  entryDate?: string | null;
  businessDate?: string | null;
  supplierName?: string | null;
  itemsSummary?: string | null;
  itemCount?: number | string | null;
  invoiceNumber?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
  amount: number | string;
}

/** The purchase-row fields the Decantation link action reads. */
export type PurchaseLinkRow = Pick<
  PurchaseRow,
  | 'id'
  | 'stationId'
  | 'businessDayId'
  | 'awaitingDecantation'
  | 'invoiceNumber'
  | 'documentNumber'
  | 'supplierName'
>;

/** A supplier as the balance list shows it (`GET /transactions/suppliers`). */
export interface SupplierRow {
  id: string;
  name: string;
  phone?: string | null;
  isActive: boolean;
  /** Σ purchases − Σ payments. Negative = an advance paid. */
  currentBalance?: number | string | null;
  metadata?: { gstin?: string | null; tradeName?: string | null; pan?: string | null } | null;
}

/**
 * The date a purchase is listed under, as the GST register reads it
 * (`COALESCE(business_date, entry_date)`): its Business Date when it sits on a
 * business day, else its Entry Date (a Fuel Purchase, ADR 0007).
 */
export const purchaseDate = (p: Pick<PurchaseRow, 'entryDate' | 'businessDate'>) =>
  p.businessDate ?? p.entryDate ?? null;

/** A Fuel Purchase whose fuel no Decantation has taken in yet (#469). */
export const isAwaitingDecantation = (
  p: Pick<PurchaseRow, 'businessDayId' | 'awaitingDecantation'>,
) => p.businessDayId == null && !!p.awaitingDecantation;

export const balanceOf = (s: Pick<SupplierRow, 'currentBalance'>) => Number(s.currentBalance || 0);

/** A muted second line, only when it adds something the first line doesn't say. */
const Detail: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => (
  <span className={mono ? 'font-mono text-[12px] text-ink-muted' : 'text-[12px] text-ink-muted'}>
    {children}
  </span>
);

/**
 * The Purchases ledger: date, supplier, items, invoice (our reference under
 * it), notes, amount. Plain money; a Fuel Purchase still awaiting its
 * Decantation carries the vocabulary chip and, with `onLinkToDecantation`, the
 * row action that links it.
 */
export function buildPurchaseColumns(
  onLinkToDecantation?: (purchase: PurchaseLinkRow) => void,
): TableColumn<PurchaseRow>[] {
  const columns: TableColumn<PurchaseRow>[] = [
    {
      id: 'entryDate',
      header: 'Date',
      kind: 'date',
      value: purchaseDate,
      width: '12%',
    },
    {
      id: 'supplier',
      header: 'Supplier',
      kind: 'text',
      emphasis: true,
      value: (r) => r.supplierName,
      cell: (r) => (
        <span className="inline-flex flex-col items-start gap-1 leading-tight">
          <span className="text-ink-strong">{r.supplierName || '—'}</span>
          {isAwaitingDecantation(r) && (
            <StatusChip status="awaiting-decantation" size="xs" className="font-sans" />
          )}
        </span>
      ),
      width: '18%',
    },
    {
      id: 'items',
      header: 'Items',
      kind: 'text',
      value: (r) => r.itemsSummary,
      cell: (r) => {
        if (!r.itemsSummary) return <span className="text-ink-faint">—</span>;
        const lines = Number(r.itemCount || 0);
        return (
          <span className="inline-flex max-w-full flex-col leading-tight">
            <span className="truncate text-ink-default" title={r.itemsSummary}>
              {r.itemsSummary}
            </span>
            {lines > 1 && <Detail>{lines} lines</Detail>}
          </span>
        );
      },
    },
    {
      id: 'invoice',
      header: 'Invoice',
      kind: 'text',
      value: (r) => r.invoiceNumber || r.documentNumber,
      cell: (r) => (
        <span className="inline-flex flex-col leading-tight">
          <span className="text-ink-strong">{r.invoiceNumber || '—'}</span>
          {r.documentNumber && r.documentNumber !== r.invoiceNumber && (
            <Detail mono>{r.documentNumber}</Detail>
          )}
        </span>
      ),
      width: '14%',
    },
    {
      id: 'notes',
      header: 'Notes',
      kind: 'text',
      value: (r) => r.notes,
      cell: (r) => <span className="text-ink-muted">{r.notes || '—'}</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      kind: 'money',
      value: (r) => r.amount,
      cell: (r) => <span className="text-ink-strong">{formatMoney(r.amount)}</span>,
      width: '14%',
    },
  ];
  if (!onLinkToDecantation) return columns;
  return [
    ...columns,
    {
      id: 'link',
      header: '',
      kind: 'text',
      value: () => null,
      width: '13%',
      cell: (r) =>
        isAwaitingDecantation(r) ? (
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Icon name="truck" size="xs" />}
            onClick={(e) => {
              e.stopPropagation();
              onLinkToDecantation(r);
            }}
          >
            Link to decantation
          </Button>
        ) : null,
    },
  ];
}

/**
 * One supplier's balance in the list: what you owe them, plain; a negative
 * balance is an advance paid, so it reads "Advance" with the amount unsigned,
 * never a green negative.
 */
const BalanceCell: React.FC<{ balance: number }> = ({ balance }) =>
  balance < 0 ? (
    <span className="inline-flex items-baseline justify-end gap-1.5">
      <span className="font-sans text-[12px] text-ink-muted">{MONEY_TERMS.advance}</span>
      <span className="text-ink-strong">{formatMoney(-balance)}</span>
    </span>
  ) : (
    <span className={balance === 0 ? 'text-ink-muted' : 'text-ink-strong'}>
      {formatMoney(balance)}
    </span>
  );

/**
 * The Suppliers balance list: supplier (trade name and GSTIN under it),
 * phone, status, balance and the edit action. The name opens the statement.
 */
export function buildSupplierColumns(
  openStatement: (s: SupplierRow) => void,
  openEdit: (s: SupplierRow) => void,
): TableColumn<SupplierRow>[] {
  return [
    {
      id: 'name',
      header: 'Supplier',
      kind: 'text',
      value: (s) => s.name,
      cell: (s) => {
        const trade = s.metadata?.tradeName;
        const gstin = s.metadata?.gstin;
        const detail = [trade && trade !== s.name ? trade : null, gstin ? `GSTIN ${gstin}` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <span className="inline-flex flex-col items-start leading-tight">
            <button
              type="button"
              className="text-left font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              onClick={() => openStatement(s)}
            >
              {s.name}
            </button>
            {detail && <Detail>{detail}</Detail>}
          </span>
        );
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      kind: 'text',
      value: (s) => s.phone,
      cell: (s) => <span className="font-mono text-ink-muted">{s.phone || '—'}</span>,
      width: '18%',
    },
    {
      id: 'status',
      header: 'Status',
      kind: 'status',
      value: (s) => partyState(s.isActive),
      width: '12%',
    },
    {
      id: 'balance',
      header: MONEY_TERMS.payable,
      kind: 'money',
      value: (s) => balanceOf(s),
      cell: (s) => <BalanceCell balance={balanceOf(s)} />,
      width: '18%',
    },
    {
      id: 'actions',
      header: '',
      kind: 'text',
      value: () => null,
      width: '6%',
      cell: (s) => (
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          title={`Edit ${s.name}`}
          aria-label={`Edit ${s.name}`}
          onClick={() => openEdit(s)}
        >
          <Icon name="edit" size="xs" />
        </Button>
      ),
    },
  ];
}

/** The Payments ledger: entry date, supplier, notes, Funding Account, amount. */
export const PAYMENT_COLUMNS: TableColumn<SupplierPaymentRow>[] = [
  { id: 'entryDate', header: 'Entry date', kind: 'date', value: (r) => r.entryDate, width: '14%' },
  {
    id: 'supplier',
    header: 'Supplier',
    kind: 'text',
    emphasis: true,
    value: (r) => r.supplierName,
    width: '24%',
  },
  {
    id: 'notes',
    header: 'Notes',
    kind: 'text',
    value: (r) => r.notes,
    cell: (r) => <span className="text-ink-muted">{r.notes || '—'}</span>,
  },
  {
    id: 'account',
    header: 'Paid from',
    kind: 'text',
    value: (r) => r.accountName,
    cell: (r) => {
      if (!r.accountName) return <span className="text-ink-faint">—</span>;
      const type = accountTypeDetail(r);
      return (
        <span className="inline-flex flex-col leading-tight">
          <span className="text-ink-strong">{r.accountName}</span>
          {type && <Detail>{type}</Detail>}
        </span>
      );
    },
    width: '18%',
  },
  {
    id: 'amount',
    header: 'Amount',
    kind: 'money',
    value: (r) => r.amount,
    cell: (r) => <span className="text-ink-strong">{formatMoney(r.amount)}</span>,
    width: '16%',
  },
];
