import type { MoneyCustomer } from '../money/parties.js';

/**
 * What the Needs attention list is made of. One alert is one open problem; the
 * bell badge, Home's "All N" and the page all count the same list.
 */
export type AlertSeverity = 'danger' | 'warning' | 'info';

/** The five kinds, in the order the page groups them. */
export type AlertCategory = 'stock' | 'day' | 'credit' | 'variance' | 'handover';

/**
 * The one page an alert can open. Stock has none (no purchasing on mobile).
 * Whether the signed-in Role may open it is decided where the alert is shown
 * (`useAlertOpener`), not here.
 */
export type AlertAction =
  | { kind: 'day'; businessDate: string }
  | { kind: 'customer'; customer: MoneyCustomer }
  | { kind: 'shift'; shiftId: string }
  | { kind: 'handover' };

export interface MobileAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  meta?: string;
  action?: AlertAction;
}
