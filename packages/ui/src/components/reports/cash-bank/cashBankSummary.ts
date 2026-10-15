import type { StationMovements } from '../../../services/cloud.js';
import { CASH_ACCOUNT_TYPES, accountTypeRank } from '../../../utils/ledgerLabels.js';

/**
 * Reports › Cash & bank as a per-account summary (#531, owner decision 14 Oct):
 * one row per account (Opening · In · Out · Closing), a subtotal per group and
 * a Cash + Bank total. No merged running balance: a merged one matches no
 * passbook, and the per-account statements live on Accounts.
 *
 * A transfer between two accounts of one group (Cash in hand → Petty cash,
 * HDFC → SBI) moved no money into or out of the group, so the group's In and
 * Out leave it out; the Cash + Bank total leaves out every transfer between
 * two of its accounts. A cash deposit to the bank stays in each group's
 * figures, since money did move between them. The account rows keep every
 * leg: the transfer did move money for that account.
 */

export type CashBankGroup = 'cash' | 'bank' | 'other';

export interface CashBankAccountRow {
  accountId: string;
  accountName: string;
  accountType: string;
  group: CashBankGroup;
  isActive: boolean;
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
  /** Entries in the range. */
  entries: number;
}

export interface CashBankFigures {
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
}

export interface CashBankGroupSummary {
  group: CashBankGroup;
  /** Every account of the group, in display order. */
  accounts: CashBankAccountRow[];
  /** The accounts shown: moved in the range or holding money (or all, when asked). */
  shown: CashBankAccountRow[];
  /** Σ of the group's accounts, In and Out net of transfers inside the group. */
  totals: CashBankFigures;
  /** Rupees of transfers inside the group left out of `totals` In (and Out). */
  internalTransfers: number;
}

export interface CashBankSummary {
  cash: CashBankGroupSummary;
  bank: CashBankGroupSummary;
  /** CMS, card/UPI clearing and Owner: listed apart, never in the Cash + Bank total. */
  other: CashBankGroupSummary;
  /** Cash + Bank, net of every transfer between two of their accounts. */
  total: CashBankFigures;
  /** Cash deposited to the bank in the range (both groups count it). */
  deposited: number;
  /** Accounts that neither moved in the range nor hold money (hidden unless `showAll`). */
  idle: number;
}

const GROUP_OF = (type: string): CashBankGroup =>
  (CASH_ACCOUNT_TYPES as string[]).includes(type) ? 'cash' : type === 'BANK' ? 'bank' : 'other';

/** In whole paise, so every sum is the sum of the figures shown. */
const paise = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const rupees = (p: number) => p / 100;

/** Whether an account is idle: nothing in the range and nothing held. */
const isIdle = (a: CashBankAccountRow) =>
  a.entries === 0 && Math.round(a.opening * 100) === 0 && Math.round(a.closing * 100) === 0;

/**
 * Builds the summary from `GET /finance/movements`. Organization-shared
 * accounts stay out (#560): their station-level figures are not their balance.
 *
 * @param showAll list idle accounts too (the "All accounts" filter).
 */
export function buildCashBankSummary(
  data: StationMovements | undefined,
  { showAll = false }: { showAll?: boolean } = {},
): CashBankSummary {
  const openings = (data?.openings ?? []).filter((o) => !o.shared);
  const movements = data?.movements ?? [];

  const rows = new Map<string, { row: CashBankAccountRow; inP: number; outP: number }>();
  for (const o of openings) {
    rows.set(o.accountId, {
      row: {
        accountId: o.accountId,
        accountName: o.accountName,
        accountType: o.accountType,
        group: GROUP_OF(o.accountType),
        isActive: o.isActive,
        opening: rupees(paise(o.opening)),
        moneyIn: 0,
        moneyOut: 0,
        closing: 0,
        entries: 0,
      },
      inP: 0,
      outP: 0,
    });
  }

  // The accounts on each side of a transfer, to tell an inside move from a real one.
  const legs = new Map<string, Set<string>>();
  for (const m of movements) {
    if (!m.transferId) continue;
    const set = legs.get(m.transferId) ?? new Set<string>();
    set.add(m.accountId);
    legs.set(m.transferId, set);
  }
  const groupOfAccount = (id: string): CashBankGroup | null => rows.get(id)?.row.group ?? null;
  /** The groups a transfer's other leg sits in (null = not in the report). */
  const otherGroup = (m: { transferId: string | null; accountId: string }) => {
    if (!m.transferId) return null;
    for (const id of legs.get(m.transferId) ?? []) {
      if (id !== m.accountId) return groupOfAccount(id);
    }
    return null;
  };

  const internalP: Record<CashBankGroup, number> = { cash: 0, bank: 0, other: 0 };
  const groupInP: Record<CashBankGroup, number> = { cash: 0, bank: 0, other: 0 };
  const groupOutP: Record<CashBankGroup, number> = { cash: 0, bank: 0, other: 0 };
  let totalInP = 0;
  let totalOutP = 0;
  let depositedP = 0;

  for (const m of movements) {
    const entry = rows.get(m.accountId);
    if (!entry) continue; // a shared account's leg
    const amount = paise(m.amount);
    const incoming = m.direction === 'in';
    entry.row.entries += 1;
    if (incoming) entry.inP += amount;
    else entry.outP += amount;

    const group = entry.row.group;
    const other = otherGroup(m);
    const insideGroup = other === group;
    if (insideGroup) {
      if (incoming) internalP[group] += amount;
    } else if (incoming) groupInP[group] += amount;
    else groupOutP[group] += amount;

    if (group === 'other') continue;
    const insideCashBank = other === 'cash' || other === 'bank';
    if (!insideCashBank) {
      if (incoming) totalInP += amount;
      else totalOutP += amount;
    }
    if (incoming && group === 'bank' && other === 'cash') depositedP += amount;
  }

  const all = [...rows.values()].map(({ row, inP, outP }) => ({
    ...row,
    moneyIn: rupees(inP),
    moneyOut: rupees(outP),
    closing: rupees(paise(row.opening) + inP - outP),
  }));
  all.sort(
    (a, b) =>
      accountTypeRank(a.accountType) - accountTypeRank(b.accountType) ||
      a.accountName.localeCompare(b.accountName),
  );

  const summarize = (group: CashBankGroup): CashBankGroupSummary => {
    const accounts = all.filter((a) => a.group === group);
    const openingP = accounts.reduce((acc, a) => acc + paise(a.opening), 0);
    return {
      group,
      accounts,
      shown: showAll ? accounts : accounts.filter((a) => !isIdle(a)),
      totals: {
        opening: rupees(openingP),
        moneyIn: rupees(groupInP[group]),
        moneyOut: rupees(groupOutP[group]),
        closing: rupees(openingP + groupInP[group] - groupOutP[group]),
      },
      internalTransfers: rupees(internalP[group]),
    };
  };

  const cash = summarize('cash');
  const bank = summarize('bank');
  const other = summarize('other');
  const openingP = paise(cash.totals.opening) + paise(bank.totals.opening);
  return {
    cash,
    bank,
    other,
    total: {
      opening: rupees(openingP),
      moneyIn: rupees(totalInP),
      moneyOut: rupees(totalOutP),
      closing: rupees(openingP + totalInP - totalOutP),
    },
    deposited: rupees(depositedP),
    idle: all.filter(isIdle).length,
  };
}
