import type { FundingAccount, FundingAccountType } from '../services/cloud.js';

export type CollectionMethod = 'Cash' | 'Card' | 'UPI' | 'BankTransfer';

/** Account types a customer collection may land in, by payment method (ADR 0005). */
export function collectionAccountTypes(method: CollectionMethod): FundingAccountType[] {
  switch (method) {
    case 'Cash':
      return ['CASH_IN_HAND', 'PETTY_CASH'];
    case 'Card':
    case 'UPI':
      return ['BANK', 'MERCHANT_CLEARING'];
    case 'BankTransfer':
      return ['BANK'];
  }
}

/** Only Card/UPI collections can go through a payment terminal. */
export function methodUsesTerminal(method: CollectionMethod): method is 'Card' | 'UPI' {
  return method === 'Card' || method === 'UPI';
}

/** Account types an expense / income / supplier payment may use. */
export const OFFICE_ACCOUNT_TYPES: FundingAccountType[] = [
  'CASH_IN_HAND',
  'PETTY_CASH',
  'BANK',
  'OWNER',
];

/** A supplier may also be paid out of the OMC card-settlement (CMS) account. */
export const SUPPLIER_PAYMENT_ACCOUNT_TYPES: FundingAccountType[] = [
  ...OFFICE_ACCOUNT_TYPES,
  'CMS',
];

export function filterFundingAccounts(
  accounts: readonly FundingAccount[],
  types: readonly FundingAccountType[],
): FundingAccount[] {
  return accounts.filter((a) => types.includes(a.accountType));
}

/**
 * What the picker should hold after the allowed list changes: keep a still-valid
 * choice, preselect the only match, otherwise clear.
 */
export function reconcileFundingSelection(
  value: string,
  options: readonly FundingAccount[],
): string {
  if (value && options.some((a) => a.id === value)) return value;
  if (options.length === 1) return options[0].id;
  return '';
}

/** Active terminals at the station that accept the method. */
export function terminalsForMethod<
  T extends { isActive?: boolean; supportsCard?: boolean; supportsUpi?: boolean },
>(terminals: readonly T[], method: CollectionMethod): T[] {
  if (!methodUsesTerminal(method)) return [];
  return terminals.filter(
    (t) => t.isActive !== false && (method === 'Card' ? !!t.supportsCard : !!t.supportsUpi),
  );
}
