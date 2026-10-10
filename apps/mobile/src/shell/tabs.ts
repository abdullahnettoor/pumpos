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

export type TabKey = 'home' | 'shifts' | 'reports' | 'money' | 'insights';

export interface TabDef {
  key: TabKey;
  label: string;
}

/** Dock order. */
export const TAB_DEFS: readonly TabDef[] = [
  { key: 'home', label: 'Home' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'reports', label: 'Reports' },
  { key: 'money', label: 'Money' },
  { key: 'insights', label: 'Insights' },
];

export const tabDef = (key: TabKey): TabDef => TAB_DEFS.find((t) => t.key === key)!;

/**
 * Whether a Role may open each tab, answered by the shared permission guards
 * (`@pump/shared`), never re-derived here. Reports and Money follow their
 * existing guards; Home, Shifts and Insights have mobile guards of their own.
 * Staff and Attendant get no tabs (Attendant has its own shell).
 */
const CAN_OPEN: Record<TabKey, (role: Role) => boolean> = {
  home: canViewMobileHome,
  shifts: canViewMobileShifts,
  reports: canViewReports,
  money: canManageFinancialAccounts,
  insights: canViewMobileInsights,
};

/**
 * The dock for a Role, in dock order. A user assigned to a Dispenser Unit on an
 * open Shift reaches their handover from a pinned card on Home, so Home is in
 * their dock even when the Role has no Home overview (a Manager, Accountant or
 * Staff member who man a pump). Home then holds only that card
 * (`TabRoot`). There is no handover tab of its own.
 */
export function tabsForRole(role: Role | null, hasHandover: boolean): TabKey[] {
  if (!role) return [];
  return TAB_DEFS.map((t) => t.key).filter((key) =>
    key === 'home' && hasHandover && !isAttendant(role) ? true : CAN_OPEN[key](role),
  );
}
