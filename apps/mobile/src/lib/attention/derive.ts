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
import { shiftHeadlineBadge } from '../cashVariance.js';
import type { AlertCategory, AlertSeverity, MobileAlert } from './types.js';
import { can, principalOf } from '@pump/shared';
import type { DensityTodaySummary, DecantationView, Role } from '@pump/shared';

/** A closed Shift's cash variance is raised only beyond this many rupees. */
const CASH_VARIANCE_ALERT_ABOVE = 200;
/** How many of the newest closed Shifts are checked for a variance. */
const VARIANCE_SHIFTS_CHECKED = 5;

/**
 * The one role policy for what an alert list may contain. Accountants have no
 * Home overview (ADR 0011, amended), so their bell carries only the work they
 * do: Decantations, Density and their own handover. Everyone else sees all.
 */
const ACCOUNTANT_CATEGORIES: readonly AlertCategory[] = ['decantation', 'density', 'handover'];
export const alertVisibleToRole = (category: AlertCategory, role?: Role | null): boolean =>
  !role || can(principalOf(role), 'mobile.fullAlerts') || ACCOUNTANT_CATEGORIES.includes(category);

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
  role?: Role | null;
  decantations?: readonly DecantationView[];
  /** Fuel product names by id; a missing id falls back to a generic label. */
  productNames?: Readonly<Record<string, string>>;
  densityToday?: DensityTodaySummary | null;
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

  const canSeeInventoryWork = can(principalOf(src.role), 'pages.inventory');

  for (const a of src.stock) {
    list.push({ id: a.id, severity: a.severity, category: 'stock', title: a.title, meta: a.meta });
  }

  for (const date of [...new Set(src.pastOpenDates)].sort().reverse()) {
    list.push({
      id: `day-${date}`,
      severity: 'warning',
      category: 'day',
      title: `${businessDateLabel(date)} not closed`,
      meta: 'DSR is a draft until the day is closed',
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
    const badge = shiftHeadlineBadge(v);
    const date = typeof s.businessDate === 'string' ? businessDateLabel(s.businessDate) : null;
    list.push({
      id: `var-${s.shiftId}`,
      severity: badge.tone === 'bad' ? 'danger' : 'warning',
      category: 'variance',
      // Which level, as the Cash variance card names it: "Attendants short by ₹340".
      title: `${shiftLabel(s)}: ${badge.label} ${v.headline < 0 ? 'short' : 'over'} by ${rupees(Math.abs(num(v.headline)))}`,
      meta: [v.headlineLevel === 'office' ? null : v.headlineNote, date]
        .filter(Boolean)
        .join(' · '),
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

  if (canSeeInventoryWork) {
    for (const decantation of src.decantations ?? []) {
      if (decantation.status === 'DISCARDED') continue;
      const productName = (id: string) => src.productNames?.[id] ?? 'Fuel';
      const action = { kind: 'decantation' as const, decantationId: decantation.id };
      if (decantation.status === 'DRAFT') {
        list.push({
          id: `dec-draft-${decantation.id}`,
          severity: 'warning',
          category: 'decantation',
          title: `${decantation.tankerNumber} still unloading`,
          meta: 'Finish unloading',
          action,
        });
      }
      for (const line of decantation.lines) {
        if (decantation.status !== 'DRAFT' && line.status === 'PENDING_MEASUREMENT') {
          list.push({
            id: `dec-pending-${line.id}`,
            severity: 'warning',
            category: 'decantation',
            title: 'Pending measurement',
            meta: `${decantation.documentNumber} · ${productName(line.productId)}`,
            action,
          });
        }
      }
      for (const productId of decantation.unlinkedProductIds ?? []) {
        list.push({
          id: `dec-unlinked-${decantation.id}-${productId}`,
          severity: 'warning',
          category: 'decantation',
          title: 'Fuel Purchase not linked',
          meta: `${decantation.documentNumber} · ${productName(productId)}`,
          action,
        });
      }
      if (decantation.flags.length > 0) {
        list.push({
          id: `dec-flagged-${decantation.id}`,
          severity: 'warning',
          category: 'decantation',
          title: 'Flagged decantation',
          meta: `${decantation.documentNumber} · ${decantation.flags.map((flag) => flag.message).join(', ')}`,
          action,
        });
      }
    }
  }

  const density = src.densityToday;
  if (
    src.role != null &&
    can(principalOf(src.role), 'inventory.density') &&
    density &&
    density.missingCount > 0
  ) {
    list.push({
      id: 'density-missing',
      severity: 'warning',
      category: 'density',
      title: `Today's density missing (${density.missingCount}/${density.totalProducts})`,
      meta: density.missingProducts.map((product) => product.productName).join(', '),
      action: { kind: 'density' },
    });
  }

  // Array.sort is stable: kind and recency above survive inside a severity.
  return list
    .filter((a) => alertVisibleToRole(a.category, src.role))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
