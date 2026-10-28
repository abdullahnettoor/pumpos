import { sql, type SQL } from 'drizzle-orm';

/**
 * The one place that decides which side of the supplier ledger a
 * `supplier_transactions` row falls on (ADR 0005).
 *
 * Unlike the customer ledger (credit sales in one table, Collections in
 * another), the whole supplier ledger is one table:
 *  - DEBITS (what you owe): every row that is not a Payment, of a positive
 *    amount: Purchases, Opening Balance, debit Adjustments.
 *  - CREDITS (what you paid): Supplier Payments, plus negative Adjustments.
 *
 * `supplierSignedAmount` is the row's effect on the balance (+ owed, - paid).
 * The suppliers list's `currentBalance`, the ranged statement (opening balance
 * and running balance) and the payables FIFO all build from it, so they cannot
 * disagree about a row.
 */

const ALIAS = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** `alias` is the table alias of `supplier_transactions` in the query (trusted; validated here). */
export const supplierSignedAmount = (alias = 'st'): SQL => {
  if (!ALIAS.test(alias)) {
    throw new Error(`supplier-ledger-sql: expected a table alias, got "${alias}"`);
  }
  const a = sql.raw(alias);
  return sql`CASE WHEN ${a}.transaction_type = 'Payment' THEN -${a}.amount ELSE ${a}.amount END`;
};
