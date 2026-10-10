/**
 * The mobile shell's tabs: the one place a tab's key, label and Role access
 * are declared. A later ticket that adds or retires a tab edits this file,
 * `tabIcons.tsx` (the dock glyph) and `TabRoot.tsx` (what the tab shows).
 */
import {
  canManageFinancialAccounts,
  canViewMobileHome,
  canViewMobileInsights,
  canViewMobileShifts,
  canViewReports,
  isAttendant,
  type Role,
} from '@pump/shared';

export type TabKey = 'home' | 'shifts' | 'reports' | 'money' | 'insights' | 'handover';

export interface TabDef {
  key: TabKey;
  label: string;
  /**
   * The tab's page ends above the floating dock instead of scrolling under it.
   * For a screen with its own sticky bottom bar (My handover, until the
   * handover ticket turns it into a detail page with an action bar).
   */
  reserveDock?: boolean;
}

/** Dock order. */
export const TAB_DEFS: readonly TabDef[] = [
  { key: 'home', label: 'Home' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'reports', label: 'Reports' },
  { key: 'money', label: 'Money' },
  { key: 'insights', label: 'Insights' },
  { key: 'handover', label: 'My handover', reserveDock: true },
];

export const tabDef = (key: TabKey): TabDef => TAB_DEFS.find((t) => t.key === key)!;

/**
 * Whether a Role may open each tab, answered by the shared permission guards
 * (`@pump/shared`), never re-derived here. Reports and Money follow their
 * existing guards; Home, Shifts and Insights have mobile guards of their own.
 * Staff and Attendant get no tabs (Attendant has its own shell). My handover is
 * not Role-based: it is added for anyone assigned to a Dispenser Unit.
 */
const CAN_OPEN: Record<Exclude<TabKey, 'handover'>, (role: Role) => boolean> = {
  home: canViewMobileHome,
  shifts: canViewMobileShifts,
  reports: canViewReports,
  money: canManageFinancialAccounts,
  insights: canViewMobileInsights,
};

/**
 * The dock for a Role, in dock order. A user who is also assigned to a Dispenser
 * Unit on an open shift gets the extra "My handover" tab.
 */
export function tabsForRole(role: Role | null, hasHandoverTab: boolean): TabKey[] {
  if (!role) return [];
  return TAB_DEFS.map((t) => t.key).filter((key) =>
    key === 'handover' ? hasHandoverTab && !isAttendant(role) : CAN_OPEN[key](role),
  );
}
