/**
 * The mobile shell's tabs: the one place a tab's key, label and Role access
 * are declared. A later ticket that adds or retires a tab edits this file,
 * `icons.tsx` (the dock glyph) and `TabRoot.tsx` (what the tab shows).
 */
import type { UserRole } from '../lib/session.js';

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

/** Tabs each Role may open on mobile (Attendant has its own shell). */
export const TABS_BY_ROLE: Record<UserRole, TabKey[]> = {
  Owner: ['home', 'shifts', 'reports', 'money', 'insights'],
  Manager: ['shifts', 'reports', 'money', 'insights'],
  Accountant: ['reports', 'money'],
  Staff: [],
  Attendant: [],
};

/**
 * The dock for a Role, in dock order. A user who is also assigned to a Dispenser
 * Unit on an open shift gets the extra "My handover" tab.
 */
export function tabsForRole(role: UserRole | null, hasHandoverTab: boolean): TabKey[] {
  const base = role ? TABS_BY_ROLE[role] : [];
  const keys = hasHandoverTab && role !== 'Attendant' ? [...base, 'handover' as const] : base;
  return TAB_DEFS.map((t) => t.key).filter((k) => keys.includes(k));
}
