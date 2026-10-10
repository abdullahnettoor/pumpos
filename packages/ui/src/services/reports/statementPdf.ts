// The data contract of the customer / supplier statement PDF. Kept free of any
// @react-pdf/renderer import (like `letterhead.ts`) so the mobile app can build
// it, and tests can check it, without pulling the PDF engine in.
//
// Every figure is the server's decimal string from the ranged ledger
// (`periodOpeningBalance`, each row's `runningBalance`, `closingBalance`): the
// PDF prints them, it does not recompute a balance.

export type StatementPdfKind = 'customer' | 'supplier';

export interface StatementPdfRow {
  /** Display date, e.g. "9 Oct 2026". */
  date: string;
  /** "Credit Sale", "Payment received", "Purchase · HSD". */
  title: string;
  /** Second line: shift, litres and vehicle; invoice and tanker; method and reference. */
  detail: string | null;
  /** Decimal string; null when the row does not add to the balance. */
  debit: string | null;
  /** Decimal string; null when the row does not reduce the balance. */
  credit: string | null;
  /** The server's running balance right after the row (decimal string). */
  balance: string;
}

export interface StatementPdfData {
  kind: StatementPdfKind;
  party: {
    name: string;
    /** Identity and contact lines: "Fleet · FL-001", "GSTIN 29…", "Phone +91…". */
    lines: string[];
  };
  /** Inclusive range, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Display label of the range, e.g. "October 2026". */
  periodLabel: string;
  /** Owed just before `from` (decimal string; negative = an advance). */
  openingBalance: string;
  /** Owed after the last row of the range (decimal string). */
  closingBalance: string;
  /** Σ of the debit and credit columns, for display next to the opening and closing figures. */
  totalDebits: string;
  totalCredits: string;
  /** Oldest first, as the ranged ledger returns them. */
  rows: StatementPdfRow[];
  /** ISO instant the PDF was built. */
  generatedAt: string;
}

/** Column and caption wording per statement kind. */
export const STATEMENT_PDF_WORDING: Record<
  StatementPdfKind,
  {
    title: string;
    debit: string;
    credit: string;
    /** What a positive / negative closing balance means. */
    owed: string;
    advance: string;
  }
> = {
  customer: {
    title: 'CUSTOMER STATEMENT',
    debit: 'Sales',
    credit: 'Received',
    owed: 'Due from customer',
    advance: 'Advance held for customer',
  },
  supplier: {
    title: 'SUPPLIER STATEMENT',
    debit: 'Purchases',
    credit: 'Paid',
    owed: 'Payable to supplier',
    advance: 'Advance paid to supplier',
  },
};

/** A file name part: ASCII letters and digits only, words joined by `_`. */
export function fileSlug(text: string, fallback: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

/** `Customer_Statement_Acme_Transport_2026-10-01_2026-10-31`. */
export function statementFileName(data: Pick<StatementPdfData, 'kind' | 'party' | 'from' | 'to'>) {
  const kind = data.kind === 'customer' ? 'Customer' : 'Supplier';
  return `${kind}_Statement_${fileSlug(data.party.name, kind)}_${data.from}_${data.to}`;
}
