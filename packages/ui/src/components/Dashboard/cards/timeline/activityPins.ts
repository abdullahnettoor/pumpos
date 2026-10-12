import type { PinEvent, PinTone } from '@pump/shared';
import type { ActivityGroupSummary } from '../../../../services/cloud.js';
import type { NavIntent } from '../../../AppShell.js';

/** Where clicking a pin event goes. */
export interface PinTarget {
  path: string;
  intent?: NavIntent;
}

export interface TimelineEvent extends PinEvent {
  target: PinTarget | null;
}

interface Mapping {
  icon: string;
  tone?: PinTone;
  path?: string;
  /** Build a nav intent from the event's aggregate id. */
  intent?: (aggregateId: string) => NavIntent;
}

/**
 * The single place that maps an activity event type to its pin icon, tone and
 * destination. Icons are `pump-ds` Icon names. Unknown types fall back to a
 * neutral info pin that goes nowhere.
 */
const toDecantations = (): NavIntent => ({ focusInventoryTab: 'decantations' });
const toCashBook = (): NavIntent => ({ openReportsTab: 'cash-book' });

const MAP: Record<string, Mapping> = {
  BUSINESS_DAY_OPENED: { icon: 'calendar', path: '/shifts' },
  BUSINESS_DAY_CLOSED: { icon: 'calendar', tone: 'success', path: '/shifts' },
  SHIFT_OPENED: { icon: 'shift', tone: 'info', path: '/shifts' },
  SHIFT_CLOSED: {
    icon: 'shift',
    tone: 'success',
    path: '/shifts',
    intent: (id) => ({ openShiftSummaryId: id }),
  },
  SHIFT_REOPENED: { icon: 'shift', tone: 'warning', path: '/shifts' },
  SHIFT_LOCKED: { icon: 'lock', path: '/shifts' },
  ATTENDANT_ASSIGNED: { icon: 'user', path: '/shifts' },
  HANDOVER_RECORDED: { icon: 'cash', tone: 'success', path: '/shifts' },
  CASH_DECLARED: { icon: 'cash', path: '/shifts' },
  DECANTATION_RECORDED: { icon: 'tank', tone: 'info', path: '/inventory', intent: toDecantations },
  DECANTATION_FLAGGED: {
    icon: 'tank',
    tone: 'warning',
    path: '/inventory',
    intent: toDecantations,
  },
  DECANTATION_DISCARDED: {
    icon: 'tank',
    tone: 'warning',
    path: '/inventory',
    intent: toDecantations,
  },
  FUEL_RECEIVED: { icon: 'truck', tone: 'info', path: '/inventory' },
  TANK_DIP_RECORDED: { icon: 'gauge', path: '/inventory' },
  TANK_TRANSFER_COMPLETED: { icon: 'arrow-left-right', path: '/inventory' },
  DENSITY_RECORDED: { icon: 'gauge', path: '/inventory' },
  INVENTORY_ADJUSTED: { icon: 'boxes', tone: 'warning', path: '/inventory' },
  PHYSICAL_COUNT_COMPLETED: { icon: 'stock-count', path: '/inventory' },
  VARIANCE_RECORDED: { icon: 'alert-triangle', tone: 'warning', path: '/inventory' },
  DSSR_GENERATED: { icon: 'report', tone: 'success', path: '/reports' },
  EXPENSE_RECORDED: { icon: 'expense', path: '/reports', intent: toCashBook },
  EXPENSE_VOIDED: { icon: 'expense', tone: 'warning', path: '/reports', intent: toCashBook },
  INCOME_RECORDED: { icon: 'income', tone: 'success', path: '/reports', intent: toCashBook },
  INCOME_VOIDED: { icon: 'income', tone: 'warning', path: '/reports', intent: toCashBook },
  PAYMENT_RECEIVED: { icon: 'wallet', tone: 'success', path: '/reports', intent: toCashBook },
  CREDIT_PAYMENT_RECEIVED: {
    icon: 'wallet',
    tone: 'success',
    path: '/reports',
    intent: toCashBook,
  },
  PAYMENT_MADE: { icon: 'wallet', path: '/reports', intent: toCashBook },
  SUPPLIER_PAID: { icon: 'wallet', path: '/reports', intent: toCashBook },
  PURCHASE_CREATED: { icon: 'purchase', path: '/purchases' },
  CREDIT_SALE_CREATED: { icon: 'customer', path: '/customers' },
  CREDIT_SALE_VOIDED: { icon: 'customer', tone: 'warning', path: '/customers' },
  RETAIL_SALE_CREATED: { icon: 'cart', path: '/shifts' },
  RETAIL_SALE_VOIDED: { icon: 'cart', tone: 'warning', path: '/shifts' },
};

const FALLBACK: Mapping = { icon: 'info' };

function toneOf(m: Mapping, apiTone: ActivityGroupSummary['primary']['tone']): PinTone {
  if (apiTone === 'danger') return 'danger';
  if (m.tone) return m.tone;
  if (apiTone === 'warning') return 'warning';
  if (apiTone === 'success') return 'success';
  if (apiTone === 'info') return 'info';
  return 'neutral';
}

/** One activity group → a timeline event (pin input + click target). */
export function toTimelineEvent(item: ActivityGroupSummary): TimelineEvent {
  const e = item.primary;
  const m = MAP[e.eventType] ?? FALLBACK;
  const target = m.path
    ? { path: m.path, ...(m.intent ? { intent: m.intent(e.aggregateId) } : {}) }
    : null;
  return {
    id: item.groupId,
    at: e.occurredAt,
    icon: m.icon,
    tone: toneOf(m, e.tone),
    label: e.title,
    href: m.path,
    target,
  };
}
