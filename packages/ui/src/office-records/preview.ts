import { formatBusinessDate, inr } from '../utils/format.js';
import type { OfficeRecordKind } from './kinds.js';

/**
 * The live "what this records" preview of an Office Record drawer (#526): the
 * balances that move, the ledger lines it writes and the checks worth a second
 * look. Pure: the drawer resolves names and balances from its caches and hands
 * them in; a figure it does not have is `null`, and anything built on it is
 * left out rather than guessed. Checks warn, they never block a save.
 */

/** A money account or a party, with its balance when the client knows it. */
export interface PreviewFigure {
  id: string;
  name: string;
  /** Account balance, a customer's due, or what is owed to a supplier. */
  balance: number | null;
}

export interface OfficeRecordDraft {
  kind: OfficeRecordKind;
  /** The record's date: Entry Date, or the Business Date of a product purchase. */
  date: string;
  /** Today's Entry Date at the station. */
  today: string;
  /** The current Business Date (Day Start applied): a product purchase's "today". */
  businessDate?: string;
  /** The amount; an invoice total for a purchase. */
  amount: number | null;
  /** What is recorded: the category, customer or supplier name. */
  what: string | null;
  /** The category or party id a repeat must share. */
  matchId: string | null;
  /** The Funding Account (a purchase's pay-now account). */
  account: PreviewFigure | null;
  party: PreviewFigure | null;
  /** A card/UPI collection through a terminal posts to its clearing account. */
  terminal?: string | null;
  /** GST % included in an income amount. */
  gstRate?: number | null;
  purchase?: PurchaseDraft;
}

export interface PurchaseDraft {
  type: 'FUEL' | 'PRODUCTS';
  /** The amount of the Supplier payment saved with it, if any. */
  payNow: number | null;
  /** That payment's Entry Date. */
  payDate?: string;
  stockLines: string[];
}

/** An earlier record of the same kind, for the repeat check. */
export interface PriorRecord {
  date: string;
  amount: number;
  matchId: string | null;
}

export interface PreviewMove {
  label: string;
  before: number;
  after: number;
}

export type PreviewCheckCode =
  'repeat' | 'negative' | 'advance' | 'backdated' | 'pay-now' | 'no-stock';

export interface PreviewCheck {
  code: PreviewCheckCode;
  tone: 'warning' | 'danger' | 'info';
  text: string;
}

export interface OfficeRecordPreview {
  moves: PreviewMove[];
  /** The one move the compact strip shows: the account, else the party. */
  mainMove: PreviewMove | null;
  lines: { label: string; amount: number | null }[];
  checks: PreviewCheck[];
  flag: { label: string; tone: 'success' | 'warning' | 'danger' };
}

const FLAG_LABEL: Partial<Record<PreviewCheckCode, string>> = {
  repeat: 'Possible repeat',
  negative: 'Goes negative',
  advance: 'Advance',
};

const OUTFLOW: Record<OfficeRecordKind, boolean> = {
  expense: true,
  income: false,
  collection: false,
  purchase: true,
  'supplier-payment': true,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A collection above what is due: the advance it leaves, or null. */
export function advanceText(due: number | null, amount: number | null): string | null {
  if (due == null || amount == null || !(amount > due)) return null;
  return `Collects more than is due: ${inr(round2(amount - Math.max(due, 0)))} becomes an advance.`;
}

/** A collection's hint: what is due before and after it, or the advance it leaves. */
export function collectionHint(due: number | null, amount: number | null): string | undefined {
  if (due == null) return undefined;
  const advance = advanceText(due, amount);
  if (advance) return advance;
  return amount != null && amount > 0
    ? `${inr(due)} due → ${inr(round2(due - amount))} after this.`
    : `${inr(due)} due.`;
}

/** A payment below what is owed: what stays owed, or null. */
export function partPaymentText(owed: number | null, amount: number | null): string | null {
  if (owed == null || amount == null || !(amount > 0) || !(amount < owed)) return null;
  return `Part payment: ${inr(round2(owed - amount))} stays owed.`;
}

/**
 * The pay-now Supplier payment's Entry Date, before the operator picks one:
 * the purchase's date. A product purchase on the current Business Day is dated
 * by its Business Date, which Day Start can hold on yesterday; its payment, an
 * Office Record, takes today's calendar date instead (ADR 0005).
 */
export function payNowDateFor(
  purchaseDate: string,
  type: PurchaseDraft['type'],
  clock: { today: string; businessDate: string },
): string {
  if (type === 'PRODUCTS' && purchaseDate && purchaseDate === clock.businessDate)
    return clock.today;
  return purchaseDate;
}

/** ", before today" for a date earlier than the latest it could be (glossary: never "backdated"). */
const before = (date: string, latest: string) =>
  `Dated ${formatBusinessDate(date)}, before ${latest}`;

export function buildOfficeRecordPreview(
  d: OfficeRecordDraft,
  prior: readonly PriorRecord[],
): OfficeRecordPreview {
  const amount = d.amount && d.amount > 0 ? d.amount : 0;
  const moves: PreviewMove[] = [];
  const lines: OfficeRecordPreview['lines'] = [];
  const checks: PreviewCheck[] = [];
  const main: { account: PreviewMove | null } = { account: null };

  const moveAccount = (delta: number) => {
    if (!d.account || d.account.balance == null) return;
    main.account = {
      label: d.account.name,
      before: d.account.balance,
      after: round2(d.account.balance + delta),
    };
    moves.push(main.account);
  };
  const moveParty = (suffix: 'due' | 'owed', delta: number) => {
    if (!d.party || d.party.balance == null) return;
    moves.push({
      label: `${d.party.name} ${suffix}`,
      before: d.party.balance,
      after: round2(d.party.balance + delta),
    });
  };

  // How much leaves the funding account.
  let outflow = 0;
  switch (d.kind) {
    case 'expense':
      outflow = amount;
      moveAccount(-amount);
      lines.push({ label: `Expense${d.what ? ` · ${d.what}` : ''}`, amount });
      break;
    case 'income': {
      moveAccount(amount);
      lines.push({ label: `Income${d.what ? ` · ${d.what}` : ''}`, amount });
      const rate = d.gstRate ?? 0;
      if (rate > 0 && amount > 0) {
        lines.push({
          label: `of which GST ${rate}% (output)`,
          amount: round2(amount - amount / (1 + rate / 100)),
        });
      }
      break;
    }
    case 'collection':
      moveParty('due', -amount);
      if (d.terminal) lines.push({ label: `${d.terminal} clearing`, amount });
      else moveAccount(amount);
      {
        const advance = advanceText(d.party?.balance ?? null, amount);
        if (advance) checks.push({ code: 'advance', tone: 'warning', text: advance });
      }
      break;
    case 'supplier-payment':
      outflow = amount;
      moveParty('owed', -amount);
      moveAccount(-amount);
      break;
    case 'purchase': {
      const paid = d.purchase?.payNow && d.purchase.payNow > 0 ? d.purchase.payNow : 0;
      outflow = paid;
      moveParty('owed', amount - paid);
      if (paid > 0) moveAccount(-paid);
      if (d.purchase?.type === 'PRODUCTS') {
        for (const s of d.purchase.stockLines) lines.push({ label: `Stock + ${s}`, amount: null });
      } else {
        checks.push({
          code: 'no-stock',
          tone: 'info',
          text: 'No stock change. Fuel stock comes from Decantation.',
        });
      }
      if (paid > 0) {
        const payDate = d.purchase?.payDate;
        checks.push({
          code: 'pay-now',
          tone: 'info',
          text:
            payDate && payDate < d.today
              ? `Also saves a Supplier payment of ${inr(paid)}, dated ${formatBusinessDate(payDate)}, before today.`
              : `Also saves a Supplier payment of ${inr(paid)}.`,
        });
      }
      break;
    }
  }

  if (
    amount > 0 &&
    d.matchId &&
    prior.some(
      (r) => r.date === d.date && r.matchId === d.matchId && Math.abs(r.amount - amount) < 0.005,
    )
  ) {
    checks.unshift({
      code: 'repeat',
      tone: 'warning',
      text: `Looks like a repeat: ${d.what ?? 'the same'} ${inr(amount)} is already recorded for ${formatBusinessDate(d.date)}.`,
    });
  }
  if (OUTFLOW[d.kind] && outflow > 0 && d.account?.balance != null && outflow > d.account.balance) {
    checks.push({
      code: 'negative',
      tone: 'danger',
      text: `${d.account.name} would go negative (${inr(round2(d.account.balance - outflow))}).`,
    });
  }
  const backdated = backdatedText(d);
  if (backdated) checks.push({ code: 'backdated', tone: 'info', text: backdated });

  const warnings = checks.filter((c) => c.tone !== 'info');
  const tone = warnings.some((c) => c.tone === 'danger') ? 'danger' : 'warning';
  const flag: OfficeRecordPreview['flag'] =
    warnings.length === 0
      ? { label: 'No issues', tone: 'success' }
      : warnings.length === 1
        ? { label: FLAG_LABEL[warnings[0].code] ?? 'Check', tone }
        : { label: `${warnings.length} checks`, tone };

  const mainMove = main.account ?? moves[0] ?? null;
  return { moves, mainMove, lines, checks, flag };
}

/** The note for a record dated before the latest date it could carry. */
function backdatedText(d: OfficeRecordDraft): string | null {
  if (!d.date) return null;
  if (d.kind === 'purchase' && d.purchase?.type === 'PRODUCTS') {
    const day = d.businessDate || d.today;
    return d.date < day
      ? `${before(d.date, "today's Business Day")}: adds stock on that day.`
      : null;
  }
  if (d.date >= d.today) return null;
  return d.kind === 'purchase'
    ? `${before(d.date, 'today')}: shows in the supplier statement for that date.`
    : `${before(d.date, 'today')}: shows in the Daily cash book for ${formatBusinessDate(d.date)}.`;
}
