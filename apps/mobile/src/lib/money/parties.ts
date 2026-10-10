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
  metadata?: {
    tradeName?: string | null;
    gstin?: string | null;
    /** Not captured by the supplier form today; shown on the page when a supplier has one. */
    vendorCode?: string | null;
  } | null;
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

/** What a Supplier page shows under the name: `GSTIN …`, `Code …`; empty parts are left out. */
export function supplierIdentity(s: Pick<MoneySupplier, 'metadata'>): string[] {
  const gstin = s.metadata?.gstin?.trim();
  const code = s.metadata?.vendorCode?.trim();
  return [gstin && `GSTIN ${gstin}`, code && `Code ${code}`].filter((x): x is string => !!x);
}

/** What a party's balance means on its own, with or without a credit limit. */
export type BalanceState = 'owes' | 'advance' | 'settled';

export function balanceState(balance: number): BalanceState {
  if (balance <= -SETTLED_BELOW) return 'advance';
  if (balance < SETTLED_BELOW) return 'settled';
  return 'owes';
}

export type StandingState =
  /** Owes more than the credit limit. */
  | 'over'
  /** Owes 80–100% of the limit. */
  | 'near'
  /** Owes less than 80% of the limit, or has no limit. */
  | 'under'
  | 'advance'
  | 'settled';

/** Colour of the credit-limit bar: accent under 80%, amber at 80–100%, red over 100%. */
export type LimitTone = 'accent' | 'warn' | 'bad';

export interface Standing {
  state: StandingState;
  /** The bar colour; always agrees with `state` (null when there is no bar: no limit or nothing owed). */
  tone: LimitTone | null;
  balance: number;
  limit: number | null;
  /**
   * Balance as a whole percent of the limit; null without a limit or when nothing is owed.
   * Rounded, but never across a band edge: 79.6% reads 79 (not near yet), 99.6% reads 99
   * (not at the limit), 100.4% reads 101 (over).
   */
  usedPct: number | null;
  /** How far past the limit (0 unless `over`). */
  overBy: number;
  /** Room left under the limit (0 unless `near` / `under` with a limit). */
  room: number;
}

export const NEAR_LIMIT_PCT = 80;

/**
 * The one place the limit bands are decided, on the exact ratio: the row bar,
 * the "Near limit" / "Over limit" badge and the page's balance card all read
 * `state` and `tone` from here, so they cannot disagree at an edge (79.6%).
 */
function band(
  balance: number,
  limit: number,
): { state: 'over' | 'near' | 'under'; tone: LimitTone } {
  const ratio = (balance / limit) * 100;
  if (balance > limit) return { state: 'over', tone: 'bad' };
  if (ratio >= NEAR_LIMIT_PCT) return { state: 'near', tone: 'warn' };
  return { state: 'under', tone: 'accent' };
}

/** Round to a whole percent without crossing the band edge: 79.6% reads 79, 99.6% reads 99. */
function bandedPct(state: 'near' | 'under', ratio: number, atLimit: boolean): number {
  const pct = Math.round(ratio);
  if (state === 'under') return Math.min(NEAR_LIMIT_PCT - 1, pct);
  return atLimit ? 100 : Math.min(99, Math.max(NEAR_LIMIT_PCT, pct));
}

/** Where a Customer stands against their credit limit (the row bar and the page's balance card). */
export function standing(c: Pick<MoneyCustomer, 'currentBalance' | 'creditLimit'>): Standing {
  const balance = balanceOf(c);
  const limit = limitOf(c);
  const kind = balanceState(balance);
  if (kind === 'advance')
    return { state: 'advance', tone: null, balance, limit, usedPct: null, overBy: 0, room: 0 };
  if (kind === 'settled')
    return { state: 'settled', tone: null, balance: 0, limit, usedPct: null, overBy: 0, room: 0 };
  if (limit === null)
    return { state: 'under', tone: null, balance, limit, usedPct: null, overBy: 0, room: 0 };

  const { state, tone } = band(balance, limit);
  const ratio = (balance / limit) * 100;
  if (state === 'over') {
    return {
      state,
      tone,
      balance,
      limit,
      usedPct: Math.max(101, Math.round(ratio)),
      overBy: balance - limit,
      room: 0,
    };
  }
  return {
    state,
    tone,
    balance,
    limit,
    usedPct: bandedPct(state, ratio, balance >= limit),
    overBy: 0,
    room: limit - balance,
  };
}

export const overLimitCount = (customers: readonly MoneyCustomer[]): number =>
  customers.filter((c) => standing(c).state === 'over').length;
