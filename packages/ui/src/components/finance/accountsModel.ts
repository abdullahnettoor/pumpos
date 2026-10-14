/**
 * The Accounts page's figures (#530): pure, so the tiles, the transfer list and
 * the statement tiles are tested without rendering.
 */

/** A Financial Account as `GET /finance/accounts` lists it. */
export interface AccountRow {
  id: string;
  name: string;
  accountType: string;
  balance: string | number;
  openingBalance?: string | number | null;
  openingDate?: string | null;
  isActive?: boolean;
}

const isCash = (type: string) => type === 'CASH_IN_HAND' || type === 'PETTY_CASH';

/**
 * Live balances by group, for the Accounts tiles and total row. Cash = Cash in
 * Hand + Petty Cash; `hasCms` says whether the station has a CMS account at all.
 * `working` is everything but Owner (capital) accounts: the money the station
 * runs on, which the list's total row shows.
 */
export function accountBalances(accounts: readonly AccountRow[]): {
  cash: number;
  bank: number;
  clearing: number;
  cms: number;
  hasCms: boolean;
  working: number;
} {
  const t = { cash: 0, bank: 0, clearing: 0, cms: 0, hasCms: false, working: 0 };
  for (const a of accounts) {
    const b = Number(a.balance || 0);
    if (a.accountType !== 'OWNER') t.working += b;
    if (isCash(a.accountType)) t.cash += b;
    else if (a.accountType === 'BANK') t.bank += b;
    else if (a.accountType === 'MERCHANT_CLEARING') t.clearing += b;
    else if (a.accountType === 'CMS') {
      t.cms += b;
      t.hasCms = true;
    }
  }
  return t;
}

/** One leg of a station money movement (`GET /finance/movements`). */
export interface MovementRow {
  id: string;
  entryDate: string;
  accountId: string;
  accountType: string;
  accountName: string;
  direction: string;
  amount: string | number;
  sourceType: string;
  transferId?: string | null;
  notes: string | null;
  createdAt: string;
}

export type TransferKind = 'deposit' | 'transfer';

/** One transfer between two accounts: its out leg and its in leg, paired. */
export interface Transfer {
  id: string;
  entryDate: string;
  kind: TransferKind;
  fromName: string;
  fromType: string | null;
  toName: string;
  toType: string | null;
  amount: number;
  /** The operator's note; `null` when it is only the generated "Transfer A → B". */
  notes: string | null;
  createdAt: string;
  /** The two legs moved different amounts: the ledger needs a look. */
  mismatch: boolean;
}

/**
 * The name shown for a side whose leg is not in this station's movements. Both
 * legs carry the station today, so this is a fallback: the partner is an
 * account shared by the organization, not one of this station's.
 */
export const ORG_ACCOUNT = 'Org account';

const TRANSFER_SOURCES: Record<string, TransferKind> = {
  DEPOSIT: 'deposit',
  TRANSFER: 'transfer',
};

/** The note `RecordTransfer` writes when the operator leaves it blank. */
const generatedNote = (kind: TransferKind, from: string | null, to: string | null) =>
  `${kind === 'deposit' ? 'Deposit' : 'Transfer'} ${from ?? ''} → ${to ?? ''}`;

/**
 * Pairs the two legs of every transfer and deposit (they share a
 * `transferId`), newest first. The amount is the out leg's; `mismatch` flags
 * legs that disagree. A leg whose partner is outside the list still shows, its
 * other side named `ORG_ACCOUNT`.
 */
type DraftTransfer = Omit<Transfer, 'fromName' | 'toName'> & {
  fromName: string | null;
  toName: string | null;
  legs: number[];
};

export function pairTransfers(movements: readonly MovementRow[]): Transfer[] {
  const byId = new Map<string, DraftTransfer>();
  for (const m of movements) {
    const kind = TRANSFER_SOURCES[m.sourceType];
    if (!kind) continue;
    const key = m.transferId ?? m.id;
    const t: DraftTransfer = byId.get(key) ?? {
      id: key,
      entryDate: m.entryDate,
      kind,
      fromName: null,
      fromType: null,
      toName: null,
      toType: null,
      amount: Number(m.amount),
      notes: m.notes,
      createdAt: m.createdAt,
      mismatch: false,
      legs: [],
    };
    t.legs.push(Number(m.amount));
    if (m.direction === 'out') {
      t.fromName = m.accountName;
      t.fromType = m.accountType;
      // The amount is what left the source account.
      t.amount = Number(m.amount);
    } else {
      t.toName = m.accountName;
      t.toType = m.accountType;
    }
    byId.set(key, t);
  }
  return [...byId.values()]
    .map(({ legs, ...t }) => ({
      ...t,
      fromName: t.fromName ?? ORG_ACCOUNT,
      toName: t.toName ?? ORG_ACCOUNT,
      mismatch: legs.some((a) => Math.round(a * 100) !== Math.round(legs[0] * 100)),
      notes: t.notes && t.notes !== generatedNote(t.kind, t.fromName, t.toName) ? t.notes : null,
    }))
    .sort(
      (a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt),
    );
}

export const sumTransfers = (rows: readonly Transfer[]) =>
  rows.reduce((sum, t) => sum + t.amount, 0);

/** A date window, both ends `YYYY-MM-DD` and included. */
export interface Window {
  from: string;
  to: string;
}

export const inWindow = (date: string | null | undefined, w: Window) =>
  !!date && date >= w.from && date <= w.to;

/** Money into and out of one account over a window, and how many entries moved it. */
export function accountFlows(
  entries: readonly { entryDate?: string | null; direction: string; amount: string | number }[],
  w: Window,
): { moneyIn: number; moneyOut: number; count: number } {
  let moneyIn = 0;
  let moneyOut = 0;
  let count = 0;
  for (const e of entries) {
    if (!inWindow(e.entryDate, w)) continue;
    count += 1;
    if (e.direction === 'in') moneyIn += Number(e.amount);
    else moneyOut += Number(e.amount);
  }
  return { moneyIn, moneyOut, count };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const entries = (n: number) => plural(n, 'entry', 'entries');
