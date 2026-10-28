import { sql, type SQL } from 'drizzle-orm';

/**
 * The one place that decides which `customer_transactions` rows are on the
 * customer ledger, and so which side of it they fall on (ADR 0005).
 *
 * The ledger has two sides:
 *  - DEBITS (what the customer owes): the `customer_transactions` rows this
 *    fragment accepts, of a positive amount: Credit Sales, Opening Balance,
 *    debit Adjustments. A negative Adjustment is a credit.
 *  - CREDITS (what the customer paid): Collections, which are Office Records in
 *    the `collections` table (Entry Date), plus those negative Adjustments.
 *
 * Two kinds of `customer_transactions` row are NOT on the ledger: an OMC
 * fleet-card sale (a CMS-settled payment channel, never a receivable) and a
 * legacy 'Collection' row (Collections now live in `collections`; counting
 * both would subtract a payment twice).
 *
 * The customers list's `currentBalance`, the ranged statement and the
 * receivables FIFO all build their WHERE clause from this, so they cannot
 * disagree about a row.
 */

const ALIAS = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** `alias` is the table alias of `customer_transactions` in the query (trusted; validated here). */
export const onCustomerLedger = (alias = 'ct'): SQL => {
  if (!ALIAS.test(alias)) {
    throw new Error(`customer-ledger-sql: expected a table alias, got "${alias}"`);
  }
  return sql`${sql.raw(alias)}.transaction_type NOT IN ('OMC Sale', 'Collection')`;
};
