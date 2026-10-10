/**
 * Pure figures behind the Money tab: who owes what, how close a Customer is to
 * their credit limit, and the order of the lists. No React, no fetching, so the
 * rules below are pinned by `parties.test.ts` and shared by To collect / To pay.
 *
 * Customer balance = Σ credit sales − Σ collections (CONTEXT.md); a negative
 * balance is an advance. Supplier balance = Σ purchases − Σ payments.
 */

/** A Customer as the customers list returns it (the fields Money reads). */
export interface MoneyCustomer {
  id: string;
  name: string;
  customerType?: string | null;
  fleetCode?: string | null;
  phone?: string | null;
  creditLimit?: number | string | null;
  currentBalance?: number | string | null;
}

/** A Supplier as the suppliers list returns it (the fields Money reads). */
export interface MoneySupplier {
  id: string;
  name: string;
  phone?: string | null;
  metadata?: { tradeName?: string | null; gstin?: string | null } | null;
  currentBalance?: number | string | null;
}

interface Party {
  name: string;
  currentBalance?: number | string | null;
}

/** Below half a paisa the balance is settled (numeric(14,2) sums can carry float dust). */
const SETTLED_BELOW = 0.005;

export const balanceOf = (p: Pick<Party, 'currentBalance'>): number => {
  const n = Number(p.currentBalance ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const limitOf = (c: Pick<MoneyCustomer, 'creditLimit'>): number | null => {
  const n = Number(c.creditLimit ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Parties that are owed money (balance above zero), the To collect / To pay lists. */
export const owing = <T extends Party>(parties: readonly T[]): T[] =>
  parties.filter((p) => balanceOf(p) >= SETTLED_BELOW);

/** What all of them add up to: advances never offset what others owe. */
export const totalOwed = (parties: readonly Party[]): number =>
  parties.reduce((sum, p) => sum + Math.max(0, balanceOf(p)), 0);

/** Largest balance first; ties by name so the order is stable across refetches. */
export const sortByBalance = <T extends Party>(parties: readonly T[]): T[] =>
  [...parties].sort((a, b) => balanceOf(b) - balanceOf(a) || a.name.localeCompare(b.name));

/** Case-insensitive name match; a blank query keeps everyone. */
export const matchName = <T extends Party>(parties: readonly T[], query: string): T[] => {
  const q = query.trim().toLowerCase();
  return q ? parties.filter((p) => p.name.toLowerCase().includes(q)) : [...parties];
};

export type StandingState =
  /** Owes more than the credit limit. */
  | 'over'
  /** Owes 80–100% of the limit. */
  | 'near'
  /** Owes less than 80% of the limit, or has no limit. */
  | 'under'
  | 'advance'
  | 'settled';

export type LimitTone = 'accent' | 'warn' | 'bad';

export interface Standing {
  state: StandingState;
  balance: number;
  limit: number | null;
  /** Balance as a whole percent of the limit; null without a limit or when nothing is owed. */
  usedPct: number | null;
  /** How far past the limit (0 unless `over`). */
  overBy: number;
  /** Room left under the limit (0 unless `near` / `under` with a limit). */
  room: number;
}

export const NEAR_LIMIT_PCT = 80;

/** Colour of the credit-limit bar: accent under 80%, amber at 80–100%, red over 100%. */
export function limitTone(usedPct: number): LimitTone {
  if (usedPct > 100) return 'bad';
  if (usedPct >= NEAR_LIMIT_PCT) return 'warn';
  return 'accent';
}

/** Where a Customer stands against their credit limit (the row bar and the page's balance card). */
export function standing(c: Pick<MoneyCustomer, 'currentBalance' | 'creditLimit'>): Standing {
  const balance = balanceOf(c);
  const limit = limitOf(c);
  if (balance <= -SETTLED_BELOW)
    return { state: 'advance', balance, limit, usedPct: null, overBy: 0, room: 0 };
  if (balance < SETTLED_BELOW)
    return { state: 'settled', balance: 0, limit, usedPct: null, overBy: 0, room: 0 };
  if (limit === null) return { state: 'under', balance, limit, usedPct: null, overBy: 0, room: 0 };

  const ratio = (balance / limit) * 100;
  if (balance > limit) {
    // 100.4% must not read "100%" next to an Over limit badge.
    return {
      state: 'over',
      balance,
      limit,
      usedPct: Math.max(101, Math.round(ratio)),
      overBy: balance - limit,
      room: 0,
    };
  }
  return {
    state: ratio >= NEAR_LIMIT_PCT ? 'near' : 'under',
    balance,
    limit,
    usedPct: Math.round(ratio),
    overBy: 0,
    room: limit - balance,
  };
}

export const overLimitCount = (customers: readonly MoneyCustomer[]): number =>
  customers.filter((c) => standing(c).state === 'over').length;
