import React, { useMemo } from 'react';
import { LogOut, TriangleAlert, Clock } from 'lucide-react';
import {
  can,
  type OperatorRole,
  principalOf,
  reachableStations,
  showStationDropdown,
  type Station,
} from '@pump/shared';
import { preReadyQuickCreateIds, type PreReadyQuickCreateId } from './quickCreateActions.js';
import type { NavIntent, NavItem } from './AppShell.js';
import { openQuickEntry } from '../quick-entry/store.js';
import { canRecordOfficeRecord, isOfficeRecordKind } from '../office-records/kinds.js';
import { initialsOf } from '../utils/initials.js';
import {
  TopBar,
  CommandPalette,
  useCommandPalette,
  type CommandGroup,
  type CommandItem,
  type NotificationItem,
  type QuickCreateAction,
  type UserMenuAction,
  type SyncStatus,
  PumpOSLockup,
  ConceptIcon,
  Icon,
} from '../pump-ds/index.js';
import { useCustomers, useStationSuppliers, useProducts } from '../query/hooks.js';
import { useStationAlerts } from '../query/useStationAlerts.js';
import { inr } from '../utils/format.js';
import { useRunTask } from '../utils/runTask.js';
import { useDesktopTitleBar } from '../utils/desktopTitleBar.js';
import { ROUTES } from '../nav-intent/routes.js';

/**
 * AppTopBar — the data container that wires the pure pump-ds `TopBar` +
 * `CommandPalette` to real app state via the existing cached query hooks.
 * AppShell renders this in its header; both apps get the shell for free.
 *
 * Kept OUT of pump-ds (it depends on app query hooks). pump-ds stays pure.
 *
 * Ambient status (business day, sync, past-open-day warnings) is rendered by
 * `AppStatusBar` in the shell's bottom bar, not here.
 *
 * TODO(follow-up): the notification derivation duplicates DashboardOverview's
 * alert logic — extract a shared `useStationAlerts(stationId)` hook so both
 * read one source.
 */

export interface AppTopBarProps {
  selectedStation: Station | null;
  navItems: NavItem[];
  userRole: OperatorRole;
  userName: string;
  syncStatus: SyncStatus;
  pendingSyncCount?: number;
  onNavigate: (path: string, intent?: NavIntent) => void;
  onLogout: () => void | Promise<unknown>;
  /** Organization stations (already scoped server-side for non-owners). */
  stations?: Station[];
  /** The user's assigned station ids; defaults to `stations` (the API filters). */
  assignedStationIds?: string[];
  onStationChange?: (station: Station) => void;
  /** Current page label, the breadcrumb's second segment. */
  pageLabel?: string;
  /** When false the active station isn't operational yet (pre-onboarding hub):
   *  hide station alerts and operational quick-create; scope the
   *  “+ New” menu to getting-started actions. */
  stationReady?: boolean;
  /** Shell-provided menu entries appended above "Log out" (desktop updates). */
  userMenuExtras?: UserMenuAction[];
}

export const AppTopBar: React.FC<AppTopBarProps> = ({
  selectedStation,
  navItems,
  userRole,
  userName,
  syncStatus,
  pendingSyncCount = 0,
  onNavigate,
  onLogout,
  stations = [],
  assignedStationIds,
  onStationChange,
  pageLabel,
  stationReady = true,
  userMenuExtras,
}) => {
  const runTask = useRunTask();
  const { open, setOpen } = useCommandPalette();
  // Desktop only: makes this bar double as the OS window title bar (#117).
  // `null` in the browser, where the top bar renders exactly as before.
  const titleBar = useDesktopTitleBar();
  const canSeeFinancials = can(principalOf(userRole), 'reports.view');
  const stationId = selectedStation?.id;

  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials });
  // The selected Station's suppliers (#575): the "due" beside each is what this
  // Station owes, and every result is one its Suppliers page lists, so the deep
  // link always finds it.
  const { data: suppliers } = useStationSuppliers(stationId, true, {
    enabled: canSeeFinancials,
  });
  const { data: products } = useProducts();
  const stationAlerts = useStationAlerts(stationId, stationReady && canSeeFinancials);

  // --- station breadcrumb: a dropdown only when more than one station is reachable ---
  const stationSwitcher = useMemo(() => {
    if (!onStationChange) return null;
    const reachable = reachableStations(
      { role: userRole, assignedStationIds: assignedStationIds ?? stations.map((s) => s.id) },
      stations,
    );
    if (!showStationDropdown(reachable)) return null;
    return {
      stations: reachable.map((s) => ({ id: s.id, name: s.name })),
      selectedId: selectedStation?.id,
      onSelect: (id: string) => {
        const next = reachable.find((s) => s.id === id);
        if (next) onStationChange(next);
      },
    };
  }, [stations, assignedStationIds, userRole, selectedStation?.id, onStationChange]);

  // --- quick create ---
  const quickCreate: QuickCreateAction[] = useMemo(() => {
    // Pre-ready (Organization hub): the only meaningful “create” is getting the
    // station operational and inviting the team. Which of those a role may see
    // is decided by `preReadyQuickCreateIds`, not here — see the note there on
    // why the rule lives outside this component.
    if (!stationReady) {
      const preReady: Record<PreReadyQuickCreateId, QuickCreateAction> = {
        'onboard-station': {
          id: 'onboard-station',
          label: 'Onboard station',
          icon: <ConceptIcon concept="stations" />,
          onSelect: () => onNavigate('/onboarding'),
        },
        'team-member': {
          id: 'team-member',
          label: 'Team member',
          icon: <ConceptIcon concept="team" />,
          onSelect: () => onNavigate('/organization'),
        },
      };
      return preReadyQuickCreateIds(userRole).map((id) => preReady[id]);
    }
    const items: QuickCreateAction[] = [
      {
        id: 'expense',
        label: 'Expense',
        icon: <ConceptIcon concept="expenses" />,
        onSelect: () => openQuickEntry('expense', { origin: 'new' }),
      },
      {
        id: 'income',
        label: 'Income',
        icon: <ConceptIcon concept="income" />,
        onSelect: () => openQuickEntry('income', { origin: 'new' }),
      },
      {
        id: 'collection',
        label: 'Collection',
        icon: <ConceptIcon concept="collections" />,
        onSelect: () => openQuickEntry('collection', { origin: 'new' }),
      },
      {
        id: 'merchandise-sale',
        label: 'Product sale',
        icon: <ConceptIcon concept="product-sales" />,
        onSelect: () => openQuickEntry('merchandise-sale'),
      },
      {
        id: 'purchase',
        label: 'Purchase',
        icon: <ConceptIcon concept="purchases" />,
        onSelect: () => openQuickEntry('purchase', { origin: 'new' }),
      },
      {
        id: 'supplier-payment',
        label: 'Supplier payment',
        icon: <ConceptIcon concept="payments" />,
        onSelect: () => openQuickEntry('supplier-payment', { origin: 'new' }),
      },
      {
        id: 'credit',
        label: 'Credit sale',
        icon: <ConceptIcon concept="credit-sales" />,
        onSelect: () => onNavigate('/shifts'),
      },
      {
        id: 'customer',
        label: 'Customer',
        icon: <ConceptIcon concept="customers" />,
        onSelect: () => onNavigate('/customers', { open: 'new-customer' }),
      },
    ];
    // One rule per item: an Office Record by the role that may record it.
    return items.filter((i) =>
      isOfficeRecordKind(i.id)
        ? canRecordOfficeRecord(i.id, userRole)
        : i.id === 'customer'
          ? can(principalOf(userRole), 'customers.manage')
          : true,
    );
  }, [onNavigate, userRole, stationReady]);

  // --- user menu ---
  const userMenu: UserMenuAction[] = [
    ...(userMenuExtras ?? []),
    {
      id: 'logout',
      label: 'Log out',
      icon: <LogOut />,
      tone: 'danger',
      onSelect: () => runTask(onLogout(), 'Could not sign out.'),
    },
  ];

  // --- notifications: shared station alerts (stock/oversold) + sync state ---
  const notifications: NotificationItem[] = useMemo(() => {
    // Pre-ready: no station is operational, so only surface sync state.
    const list: NotificationItem[] = stationReady
      ? stationAlerts.map((a) => ({
          id: a.id,
          tone: a.severity,
          icon: <TriangleAlert />,
          title: a.title,
          meta: a.meta,
          actionLabel: a.actionLabel,
          onAction: a.actionPath
            ? () =>
                onNavigate(
                  a.actionPath!,
                  a.actionTab
                    ? { focusInventoryTab: a.actionTab, focusInventoryId: a.actionEntityId }
                    : undefined,
                )
            : undefined,
        }))
      : [];
    if (syncStatus === 'failed') {
      list.push({
        id: 'sync',
        tone: 'danger',
        icon: <TriangleAlert />,
        title: 'Sync failed',
        meta: pendingSyncCount > 0 ? `${pendingSyncCount} events not synced` : 'Retry to reconcile',
        actionLabel: 'Retry',
        onAction: () => {},
      });
    } else if (syncStatus === 'pending' && pendingSyncCount > 0) {
      list.push({
        id: 'sync',
        tone: 'info',
        icon: <Clock />,
        title: `${pendingSyncCount} events pending sync`,
        meta: 'Retrying automatically',
        onAction: () => {},
      });
    }
    return list;
  }, [stationAlerts, syncStatus, pendingSyncCount, onNavigate, stationReady]);

  // --- command palette groups ---
  const commandGroups: CommandGroup[] = useMemo(() => {
    const groups: CommandGroup[] = [];

    // Actions (create)
    groups.push({
      heading: 'Actions',
      items: quickCreate.map<CommandItem>((a) => ({
        id: `act-${a.id}`,
        label: `New ${a.label.toLowerCase()}`,
        icon: a.icon,
        keywords: ['create', 'add', a.label],
        onSelect: a.onSelect,
      })),
    });

    // Customers (top by outstanding). Selecting one deep-links to the
    // registry and opens that customer's statement drawer.
    if (canSeeFinancials && (customers || []).length) {
      const rows = [...(customers as any[])]
        .sort((a, b) => Number(b.currentBalance || 0) - Number(a.currentBalance || 0))
        .slice(0, 40);
      groups.push({
        heading: 'Customers',
        items: rows.map<CommandItem>((c) => {
          const bal = Number(c.currentBalance || 0);
          const meta = bal > 0 ? `${inr(bal)} due` : (c.customerType ?? '');
          return {
            id: `cust-${c.id}`,
            label: c.name,
            icon: <ConceptIcon concept="customers" />,
            meta,
            keywords: [c.phone, c.fleetCode, c.metadata?.gstin, c.metadata?.tradeName].filter(
              Boolean,
            ),
            onSelect: () =>
              onNavigate('/customers', { focusCustomerId: c.id, open: 'customer-statement' }),
          };
        }),
      });
    }

    // Suppliers (top by outstanding). Selecting one deep-links to the supplier
    // registry and opens that supplier's statement drawer.
    if (canSeeFinancials && (suppliers || []).length) {
      const rows = [...(suppliers as any[])]
        .sort((a, b) => Number(b.currentBalance || 0) - Number(a.currentBalance || 0))
        .slice(0, 40);
      groups.push({
        heading: 'Suppliers',
        items: rows.map<CommandItem>((s) => {
          const bal = Number(s.currentBalance || 0);
          return {
            id: `sup-${s.id}`,
            label: s.name,
            icon: <ConceptIcon concept="suppliers" />,
            meta: bal > 0 ? `${inr(bal)} due` : '',
            keywords: [s.phone, s.metadata?.gstin, s.metadata?.tradeName].filter(Boolean),
            onSelect: () =>
              onNavigate(ROUTES.suppliers, { focusSupplierId: s.id, open: 'supplier-statement' }),
          };
        }),
      });
    }

    // Products
    if ((products || []).length) {
      const rows = [...(products as any[])].slice(0, 30);
      groups.push({
        heading: 'Products',
        items: rows.map<CommandItem>((p) => ({
          id: `prod-${p.id}`,
          label: p.name,
          icon: <ConceptIcon concept="products" />,
          meta: p.productType ?? '',
          keywords: [p.hsnCode, p.productType].filter(Boolean),
          onSelect: () => onNavigate('/pricing'),
        })),
      });
    }

    // Go to (from nav)
    groups.push({
      heading: 'Go to',
      items: navItems
        .filter((n) => !n.permission || can(principalOf(userRole), n.permission))
        .map<CommandItem>((n) => ({
          id: `nav-${n.path}`,
          label: n.label,
          icon: <Icon name={n.icon} />,
          keywords: ['open', 'go'],
          onSelect: () => onNavigate(n.path),
        })),
    });

    return groups;
  }, [
    quickCreate,
    customers,
    suppliers,
    products,
    navItems,
    userRole,
    canSeeFinancials,
    onNavigate,
  ]);

  return (
    <>
      <TopBar
        titleBar={titleBar}
        brand={<PumpOSLockup />}
        stationName={selectedStation?.name}
        stationSwitcher={stationSwitcher}
        pageLabel={pageLabel}
        onOpenSearch={() => setOpen(true)}
        quickCreate={quickCreate}
        notifications={notifications}
        userInitials={initialsOf(userName)}
        userName={userName}
        userRole={userRole}
        userMenu={userMenu}
      />
      <CommandPalette open={open} onOpenChange={setOpen} groups={commandGroups} />
    </>
  );
};
