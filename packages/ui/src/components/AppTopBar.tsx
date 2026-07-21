import React, { useMemo, useState } from 'react';
import {
  Receipt, Wallet, ShoppingCart, ShoppingBag, CreditCard, Users, Truck, Package, FileText, Banknote,
  ArrowUpRight, LogOut, TriangleAlert, Clock, LayoutDashboard,
} from 'lucide-react';
import { resolveBusinessDate, type Station } from '@pump/shared';
import type { NavIntent } from './AppShell.js';
import { openQuickEntry } from '../quick-entry/store.js';
import {
  TopBar, CommandPalette, useCommandPalette,
  type CommandGroup, type CommandItem, type NotificationItem,
  type QuickCreateAction, type UserMenuAction, type SyncStatus, type BusinessDayOption,
} from '../pump-ds/index.js';
import {
  useShiftStatus, useCustomers, useSuppliers, useProducts, useDailyDssrRange,
} from '../query/hooks.js';
import { useStationAlerts } from '../query/useStationAlerts.js';
import { inr } from '../utils/format.js';

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

function formatDayLabelLong(iso: string): string {
  // iso is YYYY-MM-DD; render as "Mon, 09 Jul".
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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
  const stationAlerts = useStationAlerts(stationId, canSeeFinancials);

  // --- business day ---
  const settings: any = (selectedStation as any)?.settings || {};
  const businessIso = resolveBusinessDate({ timeZone: settings.timezone, dayStartsAt: settings.business_day_starts_at });
  const businessDate = formatDayLabel(businessIso);
  const businessDayStatus: 'open' | 'closed' = (shiftStatus as any)?.activeShift ? 'open' : 'closed';

  // --- recent business days (dropdown) ---
  // Lazily loaded: the DSSR range is only fetched once the anchor menu opens,
  // so the always-mounted top bar never triggers a 30-day compute up front.
  // TODO(follow-up): replace with a lightweight `business_days` list endpoint
  // (honest per-day open/closed status, close-day action) instead of proxying
  // the DSSR range.
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const rangeFrom = addDaysIso(businessIso, -30);
  const rangeTo = addDaysIso(businessIso, -1);
  const { data: dssrRange } = useDailyDssrRange(stationId, rangeFrom, rangeTo, { enabled: !!stationId && dayMenuOpen } as any);
  const businessDays: BusinessDayOption[] = useMemo(() => {
    const rows = (dssrRange as any[]) || [];
    return rows
      .map((r) => r?.businessDate as string)
      .filter((d): d is string => !!d && d !== businessIso)
      .sort((a, b) => (a < b ? 1 : -1))
      .slice(0, 10)
      .map((d) => ({ date: d, label: formatDayLabelLong(d) }));
  }, [dssrRange, businessIso]);

  // --- quick create ---
  const quickCreate: QuickCreateAction[] = useMemo(() => {
    const items: QuickCreateAction[] = [
      { id: 'expense', label: 'Expense', icon: <Receipt />, onSelect: () => openQuickEntry('expense') },
      { id: 'income', label: 'Income', icon: <Banknote />, onSelect: () => openQuickEntry('income') },
      { id: 'collection', label: 'Collection', icon: <Wallet />, onSelect: () => openQuickEntry('collection') },
      { id: 'merchandise-sale', label: 'Merchandise sale', icon: <ShoppingBag />, onSelect: () => openQuickEntry('merchandise-sale') },
      { id: 'purchase', label: 'Purchase', icon: <ShoppingCart />, onSelect: () => openQuickEntry('purchase') },
      { id: 'supplier-payment', label: 'Supplier payment', icon: <Wallet />, onSelect: () => onNavigate('/purchases', { open: 'supplier-payment' }) },
      { id: 'credit', label: 'Credit sale', icon: <CreditCard />, onSelect: () => onNavigate('/shifts') },
      { id: 'customer', label: 'Customer', icon: <Users />, onSelect: () => onNavigate('/customers', { open: 'new-customer' }) },
    ];
    return userRole === 'Staff' ? items.filter((i) => i.id === 'expense' || i.id === 'collection' || i.id === 'merchandise-sale' || i.id === 'credit') : items;
  }, [onNavigate, userRole]);

  // --- user menu ---
  const userMenu: UserMenuAction[] = [
    { id: 'logout', label: 'Log out', icon: <LogOut />, tone: 'danger', onSelect: onLogout },
  ];

  // --- notifications: shared station alerts (stock/oversold) + sync state ---
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = stationAlerts.map((a) => ({
      id: a.id,
      tone: a.severity,
      icon: <TriangleAlert />,
      title: a.title,
      meta: a.meta,
      actionLabel: a.actionLabel,
      onAction: a.actionPath
        ? () => onNavigate(a.actionPath!, a.actionTab ? { focusInventoryTab: a.actionTab, focusInventoryId: a.actionEntityId } : undefined)
        : undefined,
    }));
    if (syncStatus === 'failed') {
      list.push({ id: 'sync', tone: 'danger', icon: <TriangleAlert />, title: 'Sync failed', meta: pendingSyncCount > 0 ? `${pendingSyncCount} events not synced` : 'Retry to reconcile', actionLabel: 'Retry', onAction: () => {} });
    } else if (syncStatus === 'pending' && pendingSyncCount > 0) {
      list.push({ id: 'sync', tone: 'info', icon: <Clock />, title: `${pendingSyncCount} events pending sync`, meta: 'Retrying automatically', onAction: () => {} });
    }
    return list;
  }, [stationAlerts, syncStatus, pendingSyncCount, onNavigate]);

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
            keywords: [c.phone, c.fleetCode, c.metadata?.gstin, c.metadata?.tradeName].filter(Boolean),
            onSelect: () => onNavigate('/customers', { focusCustomerId: c.id, open: 'customer-statement' }),
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
            onSelect: () => onNavigate('/purchases', { focusSupplierId: s.id, open: 'supplier-statement' }),
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
        businessDays={businessDays}
        onSelectBusinessDay={(date) => onNavigate('/reports', { openDssrDate: date })}
        onBusinessDayMenuOpenChange={setDayMenuOpen}
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
