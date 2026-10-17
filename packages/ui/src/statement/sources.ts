/**
 * The one source-label map for every statement row: the money ledger's
 * `sourceType` (`SALE_CASH`, `COLLECTION`, …) and the party ledgers'
 * `transactionType` (`Credit Sale`, `Collection`, …). Screen, PDF, the Daily
 * Cash Book and the Dashboard all word a row from here.
 *
 * The two vocabularies never share a key: the money ledger's are upper snake
 * case, the party ledgers' are title case. That is why a customer's
 * `Collection` reads "Payment received" while a cash account's `COLLECTION`
 * reads "Collection": the same money, seen from each side.
 */
export const SOURCE_LABEL: Readonly<Record<string, string>> = {
  // Money ledger (ledger_entries.source_type).
  OPENING: 'Opening balance',
  SALE_CASH: 'Shift cash',
  SALE_CARD: 'Card/UPI batch',
  SALE_OMC: 'OMC card sale',
  COLLECTION: 'Collection',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DEPOSIT: 'Cash deposit',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  BANK_CHARGE: 'Bank charge',
  INTEREST: 'Interest',
  ADJUSTMENT: 'Adjustment',
  // Party ledgers (customer_transactions / supplier_transactions.transaction_type).
  'Credit Sale': 'Credit Sale',
  Collection: 'Payment received',
  'Prepaid Top-up': 'Prepaid top-up',
  Purchase: 'Purchase',
  Payment: 'Payment made',
  Adjustment: 'Adjustment',
  'Opening Balance': 'Opening balance',
};

/** A row's source in words; the raw key when it is not in the map yet, `—` when there is none. */
export const sourceLabel = (source: string | null | undefined): string =>
  (source && SOURCE_LABEL[source]) || source || '—';
