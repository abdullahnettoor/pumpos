/**
 * The Needs attention list, derived only from figures the server already holds:
 * stock alerts (shared hook), the customers list (balance vs limit), the open
 * past Business Days, closed-Shift summaries and the user's own handover. Nothing
 * here recomputes money: the credit rule is `standing()` (the Money tab's), the
 * cash variance is read off the immutable Shift Summary by `deriveShiftVariance`
 * and toned by `varianceBadge` (`isBalancedVariance`). Pure.
 */
import { businessDateLabel } from '../dates.js';
import { num } from '../num.js';
import { shiftLabel, type Snapshot } from '../home/sales.js';
import { rupees } from '../format.js';
import type { OwnHandover } from '../handover/own.js';
import { standing, type MoneyCustomer } from '../money/parties.js';
import { deriveShiftVariance } from '../shifts/variance.js';
import { varianceBadge } from '../variance.js';
import type { AlertSeverity, MobileAlert } from './types.js';

/** A closed Shift's cash variance is raised only beyond this many rupees. */
const CASH_VARIANCE_ALERT_ABOVE = 200;
/** How many of the newest closed Shifts are checked for a variance. */
const VARIANCE_SHIFTS_CHECKED = 5;

const RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

export interface StockAlertLike {
  id: string;
  severity: AlertSeverity;
  title: string;
  meta?: string;
}

export interface AlertSources {
  stock: readonly StockAlertLike[];
  customers: readonly MoneyCustomer[];
  /** Open Business Days before the Current Business Date (`YYYY-MM-DD`). */
  pastOpenDates: readonly string[];
  /** Shift Summary rows (`GET /shifts/shift-summaries`). */
  summaries: readonly Snapshot[];
  ownHandover: OwnHandover | null;
}

const openedAt = (s: Snapshot) => {
  const ms = Date.parse(String(s.openedAt));
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Most severe first; within a severity, kind order (stock, day close, credit,
 * cash variance, handover), and inside a kind newest first (credit: most over
 * its limit first). Home shows the first two, the page groups the whole list.
 */
export function deriveAlerts(src: AlertSources): MobileAlert[] {
  const list: MobileAlert[] = [];

  for (const a of src.stock) {
    list.push({ id: a.id, severity: a.severity, category: 'stock', title: a.title, meta: a.meta });
  }

  for (const date of [...new Set(src.pastOpenDates)].sort().reverse()) {
    list.push({
      id: `day-${date}`,
      severity: 'warning',
      category: 'day',
      title: `${businessDateLabel(date)} not closed`,
      meta: 'DSSR is a draft until the day is closed',
      action: { kind: 'day', businessDate: date },
    });
  }

  const over = src.customers
    .map((c) => ({ c, s: standing(c) }))
    .filter(({ s }) => s.state === 'over')
    .sort((a, b) => b.s.overBy - a.s.overBy || a.c.name.localeCompare(b.c.name));
  for (const { c, s } of over) {
    list.push({
      id: `credit-${c.id}`,
      severity: 'danger',
      category: 'credit',
      title: `${c.name} over credit limit`,
      meta: `${rupees(s.balance)} of ${rupees(s.limit ?? 0)}`,
      action: { kind: 'credit', customer: c },
    });
  }

  const recent = [...src.summaries]
    .filter((s) => typeof s.shiftId === 'string' && s.shiftId)
    .sort((a, b) => openedAt(b) - openedAt(a))
    .slice(0, VARIANCE_SHIFTS_CHECKED);
  for (const s of recent) {
    const v = deriveShiftVariance((s.snapshotData ?? {}) as Snapshot);
    if (Math.abs(v.headline) <= CASH_VARIANCE_ALERT_ABOVE) continue;
    const badge = varianceBadge(v.headline);
    const date = typeof s.businessDate === 'string' ? businessDateLabel(s.businessDate) : null;
    list.push({
      id: `var-${s.shiftId}`,
      severity: badge.tone === 'bad' ? 'danger' : 'warning',
      category: 'variance',
      title: `${shiftLabel(s)} ${v.headline < 0 ? 'short' : 'over'} by ${rupees(Math.abs(num(v.headline)))}`,
      meta: [v.headlineNote, date].filter(Boolean).join(' · '),
      action: { kind: 'variance', shiftId: String(s.shiftId) },
    });
  }

  if (src.ownHandover && !src.ownHandover.saved) {
    const own = src.ownHandover;
    list.push({
      id: 'handover-own',
      severity: 'warning',
      category: 'handover',
      title: 'Your handover is not saved',
      meta: [own.shiftName, own.duLabel].filter(Boolean).join(' · ') || undefined,
      action: { kind: 'handover' },
    });
  }

  // Array.sort is stable: kind and recency above survive inside a severity.
  return list.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
