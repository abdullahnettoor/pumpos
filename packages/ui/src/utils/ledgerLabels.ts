/**
 * Shared labels for the money ledger's Financial Accounts. A ledger entry's
 * source is worded by the Statement module (`statement/sources.ts`).
 */

export type LedgerAccountType =
  'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'CMS' | 'OWNER';

/** Display order: office cash first, then banks, clearing, CMS, owner. */
export const ACCOUNT_TYPE_ORDER: LedgerAccountType[] = [
  'CASH_IN_HAND',
  'PETTY_CASH',
  'BANK',
  'MERCHANT_CLEARING',
  'CMS',
  'OWNER',
];

export const ACCOUNT_TYPE_LABEL: Record<LedgerAccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  CMS: 'OMC Card Settlement (CMS)',
  OWNER: 'Owner',
};

/** Cash accounts (office cash) — summed together in cash totals. */
export const CASH_ACCOUNT_TYPES: LedgerAccountType[] = ['CASH_IN_HAND', 'PETTY_CASH'];

export const accountTypeLabel = (t: string | null | undefined): string =>
  (t && ACCOUNT_TYPE_LABEL[t as LedgerAccountType]) || t || '—';

/**
 * The account's type as a detail beside its name, or `null` when the name is
 * exactly the type ("Cash in Hand", "petty cash"): the detail would only repeat
 * it. Any other name keeps its type, even one that contains it ("Bank of
 * Baroda" · Bank, "Owner Account" · Owner) (#530).
 */
export function accountTypeDetail(
  name: string | null | undefined,
  type: string | null | undefined,
): string | null {
  if (!type) return null;
  const label = accountTypeLabel(type);
  return (name ?? '').trim().toLowerCase() === label.trim().toLowerCase() ? null : label;
}

export const accountTypeRank = (t: string | null | undefined): number => {
  const i = ACCOUNT_TYPE_ORDER.indexOf(t as LedgerAccountType);
  return i === -1 ? ACCOUNT_TYPE_ORDER.length : i;
};
