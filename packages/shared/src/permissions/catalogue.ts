/**
 * The Permission catalogue (ADR 0013): every named thing a user may do, with
 * each Role's Default Permissions. One check, `can(principal, permission)`,
 * answers every "may this user?" question; no one compares a Role name
 * anywhere else.
 *
 * Station access (`isAuthorizedForStation`) and the whose-data rules (own
 * handover; Managers manage only Staff and Attendants) are separate, fixed
 * checks in `guards.ts` and are not Permissions.
 *
 * Defaults mirror today's behaviour exactly; `permission-matrix.generated.md`
 * is generated from this file and pinned by a test.
 */
import type { Role } from '../types/core.js';

export const ROLES: readonly Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];

interface PermissionDefInput {
  area: string;
  label: string;
  prerequisites: readonly string[];
  neverDelegable: boolean;
  defaults: readonly Role[];
}

export interface PermissionDef {
  /** Display area (a group of switches on the Owner's screen). */
  area: string;
  label: string;
  /** Permissions that must also be held for this one to mean anything. */
  prerequisites: readonly PermissionId[];
  /** True when the Owner can never delegate it to another Role's user. */
  neverDelegable: boolean;
  /** Roles that hold it by default. */
  defaults: readonly Role[];
}

const ALL: readonly Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];
const NOT_ATTENDANT: readonly Role[] = ['Owner', 'Manager', 'Accountant', 'Staff'];
const OMAS: readonly Role[] = ['Owner', 'Manager', 'Accountant', 'Staff'];
const OMA: readonly Role[] = ['Owner', 'Manager', 'Accountant'];
const OMS: readonly Role[] = ['Owner', 'Manager', 'Staff'];
const OM: readonly Role[] = ['Owner', 'Manager'];
const O: readonly Role[] = ['Owner'];

function def(
  area: string,
  label: string,
  defaults: readonly Role[],
  options: { requires?: readonly string[]; neverDelegable?: boolean } = {},
): PermissionDefInput {
  return {
    area,
    label,
    defaults,
    prerequisites: options.requires ?? [],
    neverDelegable: options.neverDelegable ?? false,
  };
}

/**
 * Keyed by Permission id (`area.action`). "View" Permissions (`pages.*`) control
 * a page's sidebar entry; the area's actions list their page as a prerequisite
 * wherever every Role's defaults already satisfy that.
 */
const CATALOGUE = {
  // Pages (sidebar)
  'pages.dashboard': def('Pages', 'View Dashboard', ALL),
  'pages.shifts': def('Pages', 'View Shifts', ['Owner', 'Manager', 'Accountant', 'Staff']),
  'pages.inventory': def('Pages', 'View Inventory', OMA),
  'pages.pricing': def('Pages', 'View Pricing', OM),
  'pages.customers': def('Pages', 'View Customers', ALL),
  'pages.suppliers': def('Pages', 'View Suppliers', OMA, { requires: ['purchases.viewCosts'] }),
  'pages.accounts': def('Pages', 'View Accounts', OMA),
  'pages.expenses': def('Pages', 'View Expenses', ALL),
  'pages.income': def('Pages', 'View Income', ALL),
  'pages.reports': def('Pages', 'View Reports', OMA),
  'pages.station': def('Pages', 'View Station', OM),
  'pages.organization': def('Pages', 'View Organization', O, { neverDelegable: true }),

  // Dashboard
  'dashboard.operations': def(
    'Dashboard',
    'See the day timeline, forecourt and fuels',
    NOT_ATTENDANT,
  ),
  'dashboard.yourShift': def('Dashboard', 'See the "Your shift" card', ['Staff']),

  // Shifts
  'shifts.open': def('Shifts', 'Open a shift', OMS, { requires: ['pages.shifts'] }),
  'shifts.close': def('Shifts', 'Close a shift', OMS, { requires: ['pages.shifts'] }),
  'shifts.reopen': def('Shifts', 'Reopen a closed shift', OM, { requires: ['pages.shifts'] }),
  'shifts.closeDay': def('Shifts', 'Close / reopen a business day', OM, {
    requires: ['pages.shifts'],
  }),
  'shifts.viewLive': def('Shifts', 'Work the live shift', OMS, { requires: ['pages.shifts'] }),
  'shifts.reviewTransactions': def('Shifts', 'Add and review transactions on a shift summary', [
    'Owner',
    'Manager',
    'Accountant',
    'Attendant',
  ]),
  'handover.record': def('Shifts', 'Record an attendant handover', ALL),

  // Pricing & products
  'pricing.change': def('Pricing', 'Change a fuel price', OM, { requires: ['pages.pricing'] }),
  'products.manage': def('Pricing', 'Manage products and MRP', OM, { requires: ['pages.pricing'] }),

  // Expenses & income
  'expenses.create': def('Expenses', 'Record and edit expenses', NOT_ATTENDANT, {
    requires: ['pages.expenses'],
  }),
  'expenses.adjust': def('Expenses', 'Adjust a closed expense', OMA, {
    requires: ['pages.expenses'],
  }),
  'expenses.void': def('Expenses', 'Void an expense', OM, { requires: ['pages.expenses'] }),
  'expenses.categories': def('Expenses', 'Manage expense categories', OMA, {
    requires: ['pages.expenses'],
  }),
  'income.record': def('Income', 'Record other income', NOT_ATTENDANT, {
    requires: ['pages.income'],
  }),

  // Purchases & inventory
  'purchases.record': def('Inventory', 'Record purchases and supplier payments', OMA, {
    requires: ['pages.inventory', 'purchases.viewCosts'],
  }),
  'purchases.adjust': def('Inventory', 'Adjust a closed purchase', OMA, {
    requires: ['pages.inventory', 'purchases.viewCosts'],
  }),
  'purchases.viewCosts': def('Inventory', 'View purchase prices / costs', OMA),
  'inventory.decantation': def('Inventory', 'Record decantations', OMA, {
    requires: ['pages.inventory'],
  }),
  'inventory.density': def('Inventory', 'Record product density', OMAS),
  'inventory.stockCount': def('Inventory', 'Record tank dips / stock counts', NOT_ATTENDANT),
  'inventory.reviewFlagged': def('Inventory', 'Review flagged decantations', O, {
    requires: ['pages.inventory'],
  }),

  // Customers & suppliers
  'customers.manage': def('Customers', 'Create and edit customers', OMA, {
    requires: ['pages.customers'],
  }),
  'customers.changeCreditLimit': def('Customers', 'Change a credit limit', OM, {
    requires: ['pages.customers'],
  }),
  'customers.archive': def('Customers', 'Archive a customer', OM, {
    requires: ['pages.customers'],
  }),
  'collections.record': def('Customers', 'Record collections', NOT_ATTENDANT, {
    requires: ['pages.customers'],
  }),
  'collections.adjust': def('Customers', 'Adjust a closed collection', OMA, {
    requires: ['pages.customers'],
  }),
  'suppliers.manage': def('Suppliers', 'Create and edit suppliers', OMA, {
    requires: ['pages.suppliers', 'purchases.viewCosts'],
  }),
  'suppliers.archive': def('Suppliers', 'Archive a supplier', OM, {
    requires: ['pages.suppliers', 'purchases.viewCosts'],
  }),

  // Accounts & reports
  'accounts.manage': def('Accounts', 'Manage money accounts and view ledgers', OMA, {
    requires: ['pages.accounts', 'purchases.viewCosts'],
  }),
  'reports.view': def('Reports', 'View reports and money figures', OMA, {
    requires: ['pages.reports'],
  }),
  'reports.export': def('Reports', 'Generate and export reports', OMA, {
    requires: ['reports.view'],
  }),
  'reports.attendant': def('Reports', 'View the attendant handover report', OMA, {
    requires: ['reports.view'],
  }),
  'reports.invoice': def('Reports', 'Issue GST tax invoices', [
    'Owner',
    'Manager',
    'Accountant',
    'Attendant',
  ]),
  'finance.viewMargin': def('Reports', 'View margin', O, { requires: ['pages.dashboard'] }),
  'finance.viewProfitLoss': def('Reports', 'View profit & loss', O, {
    requires: ['reports.view'],
  }),

  // Station setup
  'station.manage': def('Station', 'Change station setup', OM, { requires: ['pages.station'] }),
  'station.infrastructure': def('Station', 'Manage tanks, dispensers and nozzles', OM, {
    requires: ['pages.station'],
  }),
  'station.onboard': def('Station', 'Run station onboarding', OM, { requires: ['pages.station'] }),
  'station.reportTemplates': def('Station', 'Manage report templates', OM, {
    requires: ['pages.station'],
  }),
  'station.tankLevels': def('Station', 'Set tank-level thresholds', OM, {
    requires: ['pages.station'],
  }),
  'station.create': def('Station', 'Create and provision stations', O, { neverDelegable: true }),

  // Team & organization
  'team.manage': def('Team', 'Add and manage team members', OM, { neverDelegable: true }),
  'organization.edit': def('Organization', 'Edit the organization profile', O, {
    neverDelegable: true,
  }),
  'activity.view': def('Organization', 'View the activity log', O, { neverDelegable: true }),
  'subscription.viewCommercial': def('Organization', 'See plan and upgrade options', OM, {
    neverDelegable: true,
  }),
  'subscription.viewBilling': def('Organization', 'See subscription payment status', OMA, {
    neverDelegable: true,
  }),

  // Mobile (Control Room)
  'mobile.home': def('Mobile', 'Mobile Home overview', OM),
  'mobile.shifts': def('Mobile', 'Mobile Shifts tab', OM),
  'mobile.insights': def('Mobile', 'Mobile Insights tab', OM),
  'mobile.fullAlerts': def('Mobile', 'See every alert category', [
    'Owner',
    'Manager',
    'Staff',
    'Attendant',
  ]),
  'mobile.densityShortcut': def('Mobile', 'Density shortcut in place of the alerts bell', [
    'Accountant',
  ]),
} as const satisfies Record<string, PermissionDefInput>;

export type PermissionId = keyof typeof CATALOGUE;

/** The catalogue, keyed by Permission id. */
export const PERMISSIONS: Readonly<Record<PermissionId, PermissionDef>> = CATALOGUE as Record<
  PermissionId,
  PermissionDef
>;

export const PERMISSION_IDS = Object.keys(PERMISSIONS) as PermissionId[];

const DEFAULTS_BY_ROLE: Record<Role, ReadonlySet<PermissionId>> = {
  Owner: new Set(),
  Manager: new Set(),
  Accountant: new Set(),
  Staff: new Set(),
  Attendant: new Set(),
};
for (const id of PERMISSION_IDS) {
  for (const role of PERMISSIONS[id].defaults)
    (DEFAULTS_BY_ROLE[role] as Set<PermissionId>).add(id);
}

/** A Role's Default Permissions. */
export function defaultPermissionsFor(role: Role): ReadonlySet<PermissionId> {
  return DEFAULTS_BY_ROLE[role];
}

/**
 * Whoever is acting. Today only the Role matters; a later change carries the
 * user's resolved effective Permission set in `permissions`, which then takes
 * the place of the Role's defaults. Anything with a `role` (an API
 * `AuthenticatedPrincipal`, a session user) is a Principal.
 */
export interface Principal {
  role: Role;
  /** Effective Permissions when resolved server-side; absent = Role defaults. */
  permissions?: ReadonlySet<PermissionId> | readonly PermissionId[];
}

/**
 * A Principal that holds only its Role's Default Permissions. Clients hold the
 * signed-in Role as a loose string (or nothing yet); an unknown or absent Role
 * holds no Permission, so a cold start shows nothing rather than assuming access.
 */
export function principalOf(role: Role | string | null | undefined): Principal {
  return { role: (role ?? '') as Role };
}

/** The one check: may this principal do this? */
export function can(principal: Principal, permission: PermissionId): boolean {
  const granted = principal.permissions;
  if (granted) {
    return Array.isArray(granted)
      ? (granted as readonly PermissionId[]).includes(permission)
      : (granted as ReadonlySet<PermissionId>).has(permission);
  }
  return DEFAULTS_BY_ROLE[principal.role]?.has(permission) ?? false;
}

/** True when the principal holds at least one of the Permissions. */
export function canAny(principal: Principal, permissions: readonly PermissionId[]): boolean {
  return permissions.some((p) => can(principal, p));
}

/** The Role × Permission matrix of defaults, in catalogue order. */
export function roleMatrix(): {
  id: PermissionId;
  def: PermissionDef;
  roles: Record<Role, boolean>;
}[] {
  return PERMISSION_IDS.map((id) => ({
    id,
    def: PERMISSIONS[id],
    roles: Object.fromEntries(ROLES.map((r) => [r, DEFAULTS_BY_ROLE[r].has(id)])) as Record<
      Role,
      boolean
    >,
  }));
}

/** The committed matrix document, generated from the catalogue. */
export function renderRoleMatrixMarkdown(): string {
  const lines = [
    '# Role × Permission matrix',
    '',
    'Generated from `catalogue.ts` (`npm run permissions:matrix -w @pump/shared`). Do not edit by hand; a test fails if it drifts.',
    '',
    `| Area | Permission | Id | ${ROLES.join(' | ')} | Never delegable | Requires |`,
    `| --- | --- | --- | ${ROLES.map(() => ':-:').join(' | ')} | :-: | --- |`,
  ];
  for (const row of roleMatrix()) {
    const cells = ROLES.map((r) => (row.roles[r] ? 'yes' : '-')).join(' | ');
    lines.push(
      `| ${row.def.area} | ${row.def.label} | \`${row.id}\` | ${cells} | ${row.def.neverDelegable ? 'yes' : '-'} | ${row.def.prerequisites.map((p) => `\`${p}\``).join(', ') || '-'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
