/**
 * The mobile shell's tabs: the one place a tab's key, label and Role access
 * are declared. Adding or retiring a tab edits this file, `tabIcons.tsx` (the
 * dock glyph) and `TabRoot.tsx` (what the tab shows).
 */
import { can, isAttendant, type PermissionId, type Principal, type Role } from '@pump/shared';
import { principalFor } from '@pump/ui';
import type { TabKey } from '../lib/tabKey.js';

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
 * Whether a Role may open each tab, answered by the shared Permission catalogue
 * (`@pump/shared`), never re-derived here. Reports and Money follow their
 * existing guards; Home, Shifts and Insights have mobile guards of their own.
 * Staff and Attendant get no tabs (Attendant has its own shell).
 */
const TAB_PERMISSION: Record<TabKey, PermissionId> = {
  home: 'mobile.home',
  shifts: 'mobile.shifts',
  reports: 'reports.view',
  money: 'accounts.manage',
  insights: 'mobile.insights',
};

/**
 * The dock for a Role, in dock order. A user assigned to a Dispenser Unit on an
 * open Shift reaches their handover from a pinned card on Home, so Home is in
 * their dock even when the Role has no Home overview (an Accountant or Staff
 * member who mans a pump). Home then holds only that card (`TabRoot`); Owner and
 * Manager already have Home, and the card is pinned at the top of it. There is no
 * handover tab of its own.
 */
export function tabsForRole(
  role: Role | null,
  hasHandover: boolean,
  principal: Principal = principalFor(role),
): TabKey[] {
  if (!role) return [];
  return TAB_DEFS.map((t) => t.key).filter((key) =>
    key === 'home' && hasHandover && !isAttendant(role)
      ? true
      : can(principal, TAB_PERMISSION[key]),
  );
}
