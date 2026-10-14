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
  purchase?: { type: 'FUEL' | 'PRODUCTS'; payNow: number | null; stockLines: string[] };
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
      if (d.party?.balance != null && amount > d.party.balance) {
        checks.push({
          code: 'advance',
          tone: 'warning',
          text: `Collects more than is due: ${inr(amount - Math.max(d.party.balance, 0))} becomes an advance.`,
        });
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
        checks.push({
          code: 'pay-now',
          tone: 'info',
          text: `Also saves a Supplier payment of ${inr(paid)}.`,
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
  if (d.kind !== 'purchase' && d.date && d.date < d.today) {
    checks.push({
      code: 'backdated',
      tone: 'info',
      text: `Back-dated: shows in the Daily cash book for ${formatBusinessDate(d.date)}.`,
    });
  }

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
