import type { LedgerDocProps, LedgerDocRow } from '../services/reports/ledgerDoc.js';
import type { LedgerStatement } from './model.js';
import { STATEMENT_HEADERS, closingFigures, lineDate, statementLines } from './lines.js';

/** The part of `LedgerDoc`'s props a statement decides. */
export type StatementDocProps = Pick<
  LedgerDocProps,
  'debitLabel' | 'creditLabel' | 'balanceLabel' | 'rows' | 'totals' | 'opening' | 'closing'
>;

/**
 * The PDF view of a statement: the same lines the screen prints, in the same
 * order, worded and dated the same way, for `LedgerDoc`. Kept free of any
 * `@react-pdf/renderer` import so tests and the mobile app can use it.
 *
 * @param closingNote what the closing balance means ("Due from customer").
 */
export function statementDocProps(s: LedgerStatement, closingNote?: string): StatementDocProps {
  const rows = statementLines(s)
    .filter((l) => !l.opening)
    .map((l): LedgerDocRow => ({
      dateLabel: lineDate(l.date),
      particulars: l.particulars,
      detail: l.detail ?? undefined,
      debit: l.debit,
      credit: l.credit,
      balance: l.balance,
    }));
  return {
    debitLabel: STATEMENT_HEADERS.debit,
    creditLabel: STATEMENT_HEADERS.credit,
    balanceLabel: STATEMENT_HEADERS.balance,
    rows,
    totals: closingFigures(s),
    opening: s.opening ?? undefined,
    closing: { note: closingNote },
  };
}
