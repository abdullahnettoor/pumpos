import type { CashBankGroupSummary } from './cashBankSummary.js';

/**
 * The words of the Cash & bank summary's total lines (#531), shared by the
 * screen and the PDF. A total says what it leaves out.
 */

const GROUP_WORDS = {
  cash: { total: 'Cash total', between: 'cash accounts' },
  bank: { total: 'Bank total', between: 'bank accounts' },
  other: { total: 'Total', between: 'these accounts' },
} as const;

/** "Cash total", or "Cash total excl. transfers between cash accounts" when it left some out. */
export const groupTotalLabel = (g: CashBankGroupSummary): string => {
  const w = GROUP_WORDS[g.group];
  return g.internalTransfers > 0 ? `${w.total} excl. transfers between ${w.between}` : w.total;
};

/** The Cash + Bank line: what it leaves out is every move between its accounts. */
export const CASH_BANK_TOTAL_LABEL = 'Cash + Bank, excl. transfers between them';
