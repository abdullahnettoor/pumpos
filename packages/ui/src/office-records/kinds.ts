import {
  canCreateExpense,
  canRecordCollection,
  canRecordIncome,
  canRecordPurchase,
  type Role,
} from '@pump/shared';
import type { Concept } from '../pump-ds/icon/index.js';
import { formatBusinessDate } from '../utils/format.js';

/**
 * The five Office Records (ADR 0005) and the one definition each has (#526):
 * a single title, icon and confirmation, whichever screen opens the drawer.
 */
export type OfficeRecordKind =
  'expense' | 'income' | 'collection' | 'purchase' | 'supplier-payment';

/** Where the drawer was opened from; it changes the context line, never the form. */
export type OfficeRecordOrigin = 'page' | 'new' | 'statement' | 'shifts';

export interface OfficeRecordKindDef {
  label: string;
  title: string;
  concept: Concept;
  /** The confirmation toast. */
  saved: string;
  /** "Money goes out of" or "Money comes into" the Funding Account. */
  accountHint: string;
  /** The preview's name for the record's date, and where the record shows. */
  dating: OfficeRecordDating;
}

export interface OfficeRecordDating {
  dateLabel: string;
  footnote: string;
}

const OFFICE_DATING: OfficeRecordDating = {
  dateLabel: 'Entry date',
  footnote: 'Shown in the Daily cash book and the ledger. Not in the DSSR (office record).',
};

/** A product purchase is a forecourt stock event, not an Office Record (ADR 0007). */
const PRODUCT_PURCHASE_DATING: OfficeRecordDating = {
  dateLabel: 'Business date',
  footnote: "Shown in the Business Day's purchases and Product stock.",
};

const OUT = 'Money goes out of';
const IN = 'Money comes into';

export const OFFICE_RECORD_KINDS: Record<OfficeRecordKind, OfficeRecordKindDef> = {
  expense: {
    label: 'Expense',
    title: 'Record expense',
    concept: 'expenses',
    saved: 'Expense recorded.',
    accountHint: OUT,
    dating: OFFICE_DATING,
  },
  income: {
    label: 'Income',
    title: 'Record income',
    concept: 'income',
    saved: 'Income recorded.',
    accountHint: IN,
    dating: OFFICE_DATING,
  },
  collection: {
    label: 'Collection',
    title: 'Record collection',
    concept: 'collections',
    saved: 'Collection recorded.',
    accountHint: IN,
    dating: OFFICE_DATING,
  },
  purchase: {
    label: 'Purchase',
    title: 'Record purchase',
    concept: 'purchases',
    saved: 'Purchase recorded.',
    accountHint: OUT,
    dating: {
      dateLabel: 'Invoice date',
      footnote: 'Shown in the supplier statement and the ledger.',
    },
  },
  'supplier-payment': {
    label: 'Supplier payment',
    title: 'Record supplier payment',
    concept: 'payments',
    saved: 'Supplier payment recorded.',
    accountHint: OUT,
    dating: OFFICE_DATING,
  },
};

export function isOfficeRecordKind(value: string | null | undefined): value is OfficeRecordKind {
  return !!value && value in OFFICE_RECORD_KINDS;
}

/** Whether a role may record this kind (the server enforces the same guards). */
export function canRecordOfficeRecord(kind: OfficeRecordKind, role: Role): boolean {
  switch (kind) {
    case 'expense':
      return canCreateExpense(role);
    case 'income':
      return canRecordIncome(role);
    case 'collection':
      return canRecordCollection(role);
    case 'purchase':
    case 'supplier-payment':
      return canRecordPurchase(role);
  }
}

const isProductPurchase = (kind: OfficeRecordKind, purchaseType?: 'FUEL' | 'PRODUCTS') =>
  kind === 'purchase' && purchaseType === 'PRODUCTS';

/** How a record of this kind is dated, and where it shows. */
export function officeRecordDating(
  kind: OfficeRecordKind,
  purchaseType?: 'FUEL' | 'PRODUCTS',
): OfficeRecordDating {
  return isProductPurchase(kind, purchaseType)
    ? PRODUCT_PURCHASE_DATING
    : OFFICE_RECORD_KINDS[kind].dating;
}

/**
 * The line under the title: how the record is dated. A product purchase
 * belongs to its Business Day from every entry point, Shifts included.
 */
export function officeRecordContext(opts: {
  kind: OfficeRecordKind;
  origin: OfficeRecordOrigin;
  shiftName?: string | null;
  purchaseType?: 'FUEL' | 'PRODUCTS';
  date?: string;
}): string {
  if (isProductPurchase(opts.kind, opts.purchaseType)) {
    return `Product purchase · Business Day ${opts.date ? formatBusinessDate(opts.date) : ''}`.trim();
  }
  if (opts.origin === 'shifts')
    return `Office record · not part of ${opts.shiftName || 'the shift'}`;
  return 'Office record · dated by entry date';
}

/** 560px (a purchase 680px), or wider when the preview sits beside the form. */
export function officeRecordDrawerWidth(kind: OfficeRecordKind, side: boolean): number {
  const purchase = kind === 'purchase';
  if (side) return purchase ? 1040 : 920;
  return purchase ? 680 : 560;
}

/** At this window width the preview moves beside the form. */
export const PREVIEW_SIDE_QUERY = '(min-width: 1600px)';

/** How a drawer was opened: the same form, with this context. */
export interface OfficeRecordLaunch {
  origin?: OfficeRecordOrigin;
  /** Fixed by a statement: the customer of a collection, else the supplier. */
  party?: { id: string; name: string; currentBalance?: number | string | null } | null;
  /** The open shift's name, when opened from Shifts. */
  shiftName?: string | null;
  purchaseType?: 'FUEL' | 'PRODUCTS';
  /** Extra form defaults. */
  defaults?: Record<string, unknown>;
}
