/**
 * The words for money owed, used the same on every screen and in PDFs (#519).
 *
 * - Totals across parties: **Receivable** (customers owe the station) and
 *   **Payable** (the station owes suppliers).
 * - One party's balance: **Owes you** (a customer's debt) / **You owe** (what
 *   the station owes a supplier).
 * - A balance on the other side (paid ahead): **Advance**.
 */
export const MONEY_TERMS = {
  receivable: 'Receivable',
  payable: 'Payable',
  owesYou: 'Owes you',
  youOwe: 'You owe',
  advance: 'Advance',
} as const;

export type MoneyTerm = (typeof MONEY_TERMS)[keyof typeof MONEY_TERMS];
