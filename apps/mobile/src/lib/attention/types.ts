import type { MoneyCustomer } from '../money/parties.js';

/**
 * What the Needs attention list is made of. One alert is one open problem; the
 * bell badge, Home's "All N" and the page all count the same list.
 */
export type AlertSeverity = 'danger' | 'warning' | 'info';

/**
 * The one page an alert can open. Stock has none (no purchasing on mobile).
 * Whether the signed-in Role may open it is decided where the alert is shown
 * (`useAlertOpener`), not here.
 */
export type AlertAction =
  | { kind: 'day'; businessDate: string }
  | { kind: 'credit'; customer: MoneyCustomer }
  | { kind: 'variance'; shiftId: string }
  | { kind: 'handover' };

/**
 * The five kinds. An action's kind is its alert's category, so the one
 * `ALERT_KINDS` map (labels, action word, owning tab) is exhaustive over both:
 * a new kind does not compile until it has an entry.
 */
export type AlertCategory = 'stock' | AlertAction['kind'];

export interface MobileAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  meta?: string;
  action?: AlertAction;
}
