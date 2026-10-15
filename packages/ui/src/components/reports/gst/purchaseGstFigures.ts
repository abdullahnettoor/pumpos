/** The fields of an ITC register line the invoice count reads. */
export interface ItcLine {
  /** The purchase the line belongs to: one purchase is one supplier invoice. */
  purchaseId: string;
}

/**
 * How many supplier invoices the ITC register's lines come from (#575). A
 * purchase with several GST lines is still one invoice, so the count is of
 * distinct purchases, never of lines: the old fallback to the line id counted a
 * purchase with no invoice or document number once per line.
 */
export function itcInvoiceCount(lines: readonly ItcLine[]): number {
  return new Set(lines.map((line) => line.purchaseId)).size;
}
