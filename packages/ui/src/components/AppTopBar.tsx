import React, { useMemo } from 'react';
import {
  Receipt, Wallet, ShoppingCart, CreditCard, Users, Truck, Package, FileText,
  ArrowUpRight, LogOut, TriangleAlert, Clock, LayoutDashboard,
} from 'lucide-react';
import { resolveBusinessDate, type Station } from '@pump/shared';
import {
  TopBar, CommandPalette, useCommandPalette,
  type CommandGroup, type CommandItem, type NotificationItem,
  type QuickCreateAction, type UserMenuAction, type SyncStatus,
} from '../pump-ds/index.js';
import {
  useShiftStatus, useCustomers, useSuppliers, useProducts, useInventoryStatus, useInventoryItems,
} from '../query/hooks.js';
import { inr, formatQty } from '../utils/format.js';

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
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onToggleSidebar?: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDayLabel(iso: string): string {
  // iso is YYYY-MM-DD; render as "09 Jul".
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
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
}) => {
  const { open, setOpen } = useCommandPalette();
  const canSeeFinancials = userRole !== 'Staff';
  const stationId = selectedStation?.id;

  const { data: shiftStatus } = useShiftStatus(stationId);
  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials } as any);
  const { data: suppliers } = useSuppliers(true, { enabled: canSeeFinancials } as any);
  const { data: products } = useProducts();
  const { data: tanks } = useInventoryStatus(stationId, { enabled: canSeeFinancials } as any);
  const { data: inventoryItems } = useInventoryItems(stationId, { enabled: canSeeFinancials } as any);

  // --- business day ---
  const settings: any = (selectedStation as any)?.settings || {};
  const businessIso = resolveBusinessDate({ timeZone: settings.timezone, dayStartsAt: settings.business_day_starts_at });
  const businessDate = formatDayLabel(businessIso);
  const businessDayStatus: 'open' | 'closed' = (shiftStatus as any)?.activeShift ? 'open' : 'closed';

  // --- quick create ---
  const quickCreate: QuickCreateAction[] = useMemo(() => {
    const items: QuickCreateAction[] = [
      { id: 'expense', label: 'Expense', icon: <Receipt />, shortcut: 'E', onSelect: () => onNavigate('/expenses') },
      { id: 'collection', label: 'Collection', icon: <Wallet />, onSelect: () => onNavigate('/customers') },
      { id: 'purchase', label: 'Purchase', icon: <ShoppingCart />, onSelect: () => onNavigate('/purchases') },
      { id: 'credit', label: 'Credit sale', icon: <CreditCard />, onSelect: () => onNavigate('/shifts') },
      { id: 'customer', label: 'Customer', icon: <Users />, onSelect: () => onNavigate('/customers') },
    ];
    return userRole === 'Staff' ? items.filter((i) => i.id === 'expense' || i.id === 'credit') : items;
  }, [onNavigate, userRole]);

  // --- user menu ---
  const userMenu: UserMenuAction[] = [
    { id: 'logout', label: 'Log out', icon: <LogOut />, tone: 'danger', onSelect: onLogout },
  ];

  // --- notifications (derived; see TODO to share with dashboard) ---
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];
    if (canSeeFinancials) {
      (tanks || []).forEach((t: any) => {
        const cap = Number(t.capacity) || 0;
        const vol = Number(t.currentVolume) || 0;
        if (!cap) return;
        const pct = (vol / cap) * 100;
        if (pct < 5) {
          list.push({ id: `tank-${t.id}`, tone: 'danger', icon: <TriangleAlert />, title: `${t.name} critically low`, meta: `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`, actionLabel: 'Stock', onAction: () => onNavigate('/inventory') });
        } else if (pct < 15) {
          list.push({ id: `tank-${t.id}`, tone: 'warning', icon: <TriangleAlert />, title: `${t.name} running low`, meta: `${t.productName} · ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`, actionLabel: 'Stock', onAction: () => onNavigate('/inventory') });
        }
      });
      (inventoryItems || []).forEach((i: any) => {
        if (Number(i.quantity) < 0) {
          list.push({ id: `item-${i.productId}`, tone: 'danger', icon: <TriangleAlert />, title: `${i.name} oversold`, meta: `${formatQty(Number(i.quantity))} ${i.unit ?? ''}`.trim(), actionLabel: 'Stock', onAction: () => onNavigate('/inventory') });
        }
      });
    }
    if (syncStatus === 'failed') {
      list.push({ id: 'sync', tone: 'danger', icon: <TriangleAlert />, title: 'Sync failed', meta: pendingSyncCount > 0 ? `${pendingSyncCount} events not synced` : 'Retry to reconcile', actionLabel: 'Retry', onAction: () => {} });
    } else if (syncStatus === 'pending' && pendingSyncCount > 0) {
      list.push({ id: 'sync', tone: 'info', icon: <Clock />, title: `${pendingSyncCount} events pending sync`, meta: 'Retrying automatically', actionLabel: '', onAction: () => {} });
    }
    // Danger first, then warning, then info.
    const rank = { danger: 0, warning: 1, info: 2 } as const;
    return list.sort((a, b) => rank[a.tone] - rank[b.tone]);
  }, [tanks, inventoryItems, syncStatus, pendingSyncCount, canSeeFinancials, onNavigate]);

  // --- command palette groups ---
  const commandGroups: CommandGroup[] = useMemo(() => {
    const groups: CommandGroup[] = [];

    // Actions (create)
    groups.push({
      heading: 'Actions',
      items: quickCreate.map<CommandItem>((a) => ({
        id: `act-${a.id}`, label: `New ${a.label.toLowerCase()}`, icon: a.icon, keywords: ['create', 'add', a.label], onSelect: a.onSelect,
      })),
    });

    // Customers (top by outstanding)
    if (canSeeFinancials && (customers || []).length) {
      const rows = [...(customers as any[])]
        .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
        .slice(0, 40);
      groups.push({
        heading: 'Customers',
        items: rows.map<CommandItem>((c) => ({
          id: `cust-${c.id}`,
          label: c.name,
          icon: <Users />,
          meta: Number(c.balance || 0) > 0 ? `${c.code ?? ''} · ${inr(c.balance)} due`.trim() : (c.code ?? ''),
          keywords: [c.code, c.phone, c.gstin].filter(Boolean),
          onSelect: () => onNavigate('/customers'),
        })),
      });
    }

    // Suppliers
    if (canSeeFinancials && (suppliers || []).length) {
      const rows = [...(suppliers as any[])].slice(0, 30);
      groups.push({
        heading: 'Suppliers',
        items: rows.map<CommandItem>((s) => ({
          id: `sup-${s.id}`, label: s.name, icon: <Truck />, meta: s.code ?? '', keywords: [s.code, s.phone].filter(Boolean), onSelect: () => onNavigate('/purchases'),
        })),
      });
    }

    // Products
    if ((products || []).length) {
      const rows = [...(products as any[])].slice(0, 30);
      groups.push({
        heading: 'Products',
        items: rows.map<CommandItem>((p) => ({
          id: `prod-${p.id}`, label: p.name, icon: <Package />, meta: p.productType ?? '', keywords: [p.hsnCode, p.productType].filter(Boolean), onSelect: () => onNavigate('/pricing'),
        })),
      });
    }

    // Go to (from nav)
    groups.push({
      heading: 'Go to',
      items: navItems
        .filter((n) => !n.roles || n.roles.includes(userRole))
        .map<CommandItem>((n) => ({
          id: `nav-${n.path}`, label: n.label, icon: n.label === 'Dashboard' ? <LayoutDashboard /> : <ArrowUpRight />, keywords: ['open', 'go'], onSelect: () => onNavigate(n.path),
        })),
    });

    return groups;
  }, [quickCreate, customers, suppliers, products, navItems, userRole, canSeeFinancials, onNavigate]);

  return (
    <>
      <TopBar
        onToggleSidebar={onToggleSidebar}
        brand="PumpOS"
        businessDate={businessDate}
        businessDayStatus={businessDayStatus}
        onBusinessDay={() => onNavigate('/dashboard')}
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
