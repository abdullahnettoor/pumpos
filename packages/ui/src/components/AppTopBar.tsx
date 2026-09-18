import React, { useMemo } from 'react';
import {
  Receipt,
  Wallet,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  Users,
  Truck,
  Package,
  FileText,
  Banknote,
  ArrowUpRight,
  LogOut,
  TriangleAlert,
  Clock,
  LayoutDashboard,
  Fuel,
} from 'lucide-react';
import { type Station } from '@pump/shared';
import type { NavIntent } from './AppShell.js';
import { openQuickEntry } from '../quick-entry/store.js';
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
  type BusinessDayOption,
  PumpOSLockup,
} from '../pump-ds/index.js';
import { useBusinessDayStatus, useCustomers, useSuppliers, useProducts } from '../query/hooks.js';
import { useStationAlerts } from '../query/useStationAlerts.js';
import { inr } from '../utils/format.js';
import { useStationBusinessDate } from '../hooks/useStationBusinessDate.js';
import { useRunTask } from '../utils/runTask.js';
import { useDesktopTitleBar } from '../utils/desktopTitleBar.js';

/**
 * AppTopBar — the data container that wires the pure pump-ds `TopBar` +
 * `CommandPalette` to real app state via the existing cached query hooks.
 * AppShell renders this in its header; both apps get the shell for free.
 *
 * Kept OUT of pump-ds (it depends on app query hooks). pump-ds stays pure.
 *
 * TODO(follow-up): the notification derivation duplicates DashboardOverview's
 * alert logic — extract a shared `useStationAlerts(stationId)` hook so both
 * read one source.
 */

export interface AppTopBarProps {
  selectedStation: Station | null;
  navItems: { label: string; path: string; roles?: string[] }[];
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  syncStatus: SyncStatus;
  pendingSyncCount?: number;
  onNavigate: (path: string, intent?: NavIntent) => void;
  onLogout: () => void | Promise<unknown>;
  onToggleSidebar?: () => void;
  /** When false the active station isn't operational yet (pre-onboarding hub):
   *  hide business day, station alerts, and operational quick-create; scope the
   *  “+ New” menu to getting-started actions. */
  stationReady?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDayLabel(iso: string): string {
  // iso is YYYY-MM-DD; render as "09 Jul 2026".
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  onToggleSidebar,
  stationReady = true,
}) => {
  const runTask = useRunTask();
  const { open, setOpen } = useCommandPalette();
  // Desktop only: makes this bar double as the OS window title bar (#117).
  // `null` in the browser, where the top bar renders exactly as before.
  const titleBar = useDesktopTitleBar();
  const canSeeFinancials = userRole !== 'Staff';
  const stationId = selectedStation?.id;

  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials } as any);
  const { data: suppliers } = useSuppliers(true, { enabled: canSeeFinancials } as any);
  const { data: products } = useProducts();
  const stationAlerts = useStationAlerts(stationId, stationReady && canSeeFinancials);

  // --- business day ---
  const settings: any = (selectedStation as any)?.settings || {};
  const businessIso = useStationBusinessDate(settings.timezone, settings.business_day_starts_at);
  const businessDate = formatDayLabel(businessIso);
  const dayStatusQ = useBusinessDayStatus(stationId, businessIso, {
    enabled: !!stationId && stationReady,
  } as any);
  const dayStatus = dayStatusQ.data;
  const businessDayStatus = dayStatusQ.isError
    ? 'unavailable'
    : dayStatusQ.isPending
      ? 'unknown'
      : dayStatus?.requestedState === 'OPEN'
        ? 'open'
        : dayStatus?.requestedState === 'CLOSED'
          ? 'closed'
          : 'not-created';

  const businessDays: BusinessDayOption[] = useMemo(() => {
    return (dayStatus?.pastOpenBusinessDays ?? []).map((day: any) => ({
      date: day.businessDate,
      label: formatDayLabel(day.businessDate),
      status: 'open',
      openShiftCount: Number(day.openShiftCount),
      closedShiftCount: Number(day.closedShiftCount),
      lastActivityAt: day.lastActivityAt,
    }));
  }, [dayStatus]);

  // --- quick create ---
  const quickCreate: QuickCreateAction[] = useMemo(() => {
    // Pre-ready (Organization hub): the only meaningful “create” is getting the
    // station operational and inviting the team.
    if (!stationReady) {
      return [
        {
          id: 'onboard-station',
          label: 'Onboard station',
          icon: <Fuel />,
          onSelect: () => onNavigate('/onboarding'),
        },
        {
          id: 'team-member',
          label: 'Team member',
          icon: <Users />,
          onSelect: () => onNavigate('/organization'),
        },
      ];
    }
    const items: QuickCreateAction[] = [
      {
        id: 'expense',
        label: 'Expense',
        icon: <Receipt />,
        onSelect: () => openQuickEntry('expense'),
      },
      {
        id: 'income',
        label: 'Income',
        icon: <Banknote />,
        onSelect: () => openQuickEntry('income'),
      },
      {
        id: 'collection',
        label: 'Collection',
        icon: <Wallet />,
        onSelect: () => openQuickEntry('collection'),
      },
      {
        id: 'merchandise-sale',
        label: 'Merchandise sale',
        icon: <ShoppingBag />,
        onSelect: () => openQuickEntry('merchandise-sale'),
      },
      {
        id: 'purchase',
        label: 'Purchase',
        icon: <ShoppingCart />,
        onSelect: () => openQuickEntry('purchase'),
      },
      {
        id: 'supplier-payment',
        label: 'Supplier payment',
        icon: <Wallet />,
        onSelect: () => onNavigate('/purchases', { open: 'supplier-payment' }),
      },
      {
        id: 'credit',
        label: 'Credit sale',
        icon: <CreditCard />,
        onSelect: () => onNavigate('/shifts'),
      },
      {
        id: 'customer',
        label: 'Customer',
        icon: <Users />,
        onSelect: () => onNavigate('/customers', { open: 'new-customer' }),
      },
    ];
    return userRole === 'Staff'
      ? items.filter(
          (i) =>
            i.id === 'expense' ||
            i.id === 'collection' ||
            i.id === 'merchandise-sale' ||
            i.id === 'credit',
        )
      : items;
  }, [onNavigate, userRole, stationReady]);

  // --- user menu ---
  const userMenu: UserMenuAction[] = [
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
            icon: <Users />,
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
            icon: <Truck />,
            meta: bal > 0 ? `${inr(bal)} due` : '',
            keywords: [s.phone, s.metadata?.gstin, s.metadata?.tradeName].filter(Boolean),
            onSelect: () =>
              onNavigate('/purchases', { focusSupplierId: s.id, open: 'supplier-statement' }),
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
          icon: <Package />,
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
        .filter((n) => !n.roles || n.roles.includes(userRole))
        .map<CommandItem>((n) => ({
          id: `nav-${n.path}`,
          label: n.label,
          icon: n.label === 'Dashboard' ? <LayoutDashboard /> : <ArrowUpRight />,
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
        onToggleSidebar={onToggleSidebar}
        brand={<PumpOSLockup />}
        businessDate={businessDate}
        businessDayStatus={businessDayStatus}
        showBusinessDay={stationReady}
        onBusinessDay={() => onNavigate('/shifts', { openBusinessDayDate: businessIso })}
        businessDays={dayStatusQ.isError || dayStatusQ.isPending ? [] : businessDays}
        businessDaysState={
          dayStatusQ.isError ? 'unavailable' : dayStatusQ.isPending ? 'loading' : 'ready'
        }
        onSelectBusinessDay={(date) => onNavigate('/shifts', { openBusinessDayDate: date })}
        stationLabel={selectedStation?.name}
        onOpenSearch={() => setOpen(true)}
        quickCreate={quickCreate}
        notifications={notifications}
        syncStatus={syncStatus}
        pendingSyncCount={pendingSyncCount}
        userInitials={initialsOf(userName)}
        userName={userName}
        userRole={userRole}
        userMenu={userMenu}
      />
      <CommandPalette open={open} onOpenChange={setOpen} groups={commandGroups} />
    </>
  );
};
