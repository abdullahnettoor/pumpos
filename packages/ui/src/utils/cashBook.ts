import type { DailyCashBookAccount } from '../services/cloud.js';
import { CASH_ACCOUNT_TYPES, accountTypeRank } from './ledgerLabels.js';

/** Move a `YYYY-MM-DD` calendar date by `days` (pure date arithmetic, no timezone). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Accounts in cash-book order: account type (office cash first), then name. */
export function sortCashBookAccounts<T extends Pick<DailyCashBookAccount, 'accountType' | 'name'>>(
  accounts: readonly T[],
): T[] {
  return [...accounts].sort(
    (a, b) =>
      accountTypeRank(a.accountType) - accountTypeRank(b.accountType) ||
      a.name.localeCompare(b.name),
  );
}

export interface CashBookTotals {
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Office cash position: Cash in Hand + Petty Cash. */
export function cashAccountTotals(
  accounts: readonly Pick<
    DailyCashBookAccount,
    'accountType' | 'opening' | 'moneyIn' | 'moneyOut' | 'closing'
  >[],
): CashBookTotals {
  return accounts
    .filter((a) => CASH_ACCOUNT_TYPES.includes(a.accountType))
    .reduce<CashBookTotals>(
      (t, a) => ({
        opening: r2(t.opening + Number(a.opening || 0)),
        moneyIn: r2(t.moneyIn + Number(a.moneyIn || 0)),
        moneyOut: r2(t.moneyOut + Number(a.moneyOut || 0)),
        closing: r2(t.closing + Number(a.closing || 0)),
      }),
      { opening: 0, moneyIn: 0, moneyOut: 0, closing: 0 },
    );
}
