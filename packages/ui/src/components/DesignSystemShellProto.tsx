import React, { useState } from 'react';
import {
  Receipt, Wallet, ShoppingCart, CreditCard, Users, FileText, ArrowUpRight,
  CircleUserRound, Settings, Keyboard, LogOut, TriangleAlert, Clock,
} from 'lucide-react';
import {
  TopBar, CommandPalette, useCommandPalette,
  type CommandGroup, type NotificationItem, type QuickCreateAction, type UserMenuAction,
} from '../pump-ds/index.js';

/**
 * SHELL PROTOTYPE — now the REAL, interactive primitives (TopBar +
 * CommandPalette + Radix menus), driven by local demo state. This is the same
 * code that will drop into AppShell; here it runs against mock data so the
 * behavior (⌘K, menus, notifications) can be exercised before wiring the live
 * shell. Try: click Search or press ⌘K; open + New / bell / avatar.
 */

const Group: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="mb-10">
    <header className="mb-4">
      <div className="text-[13px] font-semibold uppercase tracking-wider text-ink-strong">{title}</div>
      {description && <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-ink-muted">{description}</p>}
    </header>
    {children}
  </section>
);

export const DesignSystemShellProtoPanel: React.FC = () => {
  const { open, setOpen } = useCommandPalette();
  const [lastAction, setLastAction] = useState<string>('—');

  const note = (msg: string) => setLastAction(msg);

  const quickCreate: QuickCreateAction[] = [
    { id: 'expense', label: 'Expense', icon: <Receipt />, shortcut: 'E', onSelect: () => note('Create: Expense') },
    { id: 'collection', label: 'Collection', icon: <Wallet />, onSelect: () => note('Create: Collection') },
    { id: 'purchase', label: 'Purchase', icon: <ShoppingCart />, onSelect: () => note('Create: Purchase') },
    { id: 'credit', label: 'Credit sale', icon: <CreditCard />, onSelect: () => note('Create: Credit sale') },
    { id: 'customer', label: 'Customer', icon: <Users />, onSelect: () => note('Create: Customer') },
  ];

  const notifications: NotificationItem[] = [
    { id: 'tank', tone: 'danger', icon: <TriangleAlert />, title: 'Tank 2 critically low', meta: 'Diesel · 4% · 320 L remaining', actionLabel: 'Stock', onAction: () => note('Notif → Stock') },
    { id: 'overdue', tone: 'warning', icon: <Clock />, title: 'Sunrise Logistics overdue', meta: 'SUN-018 · ₹9,42,600 · 38 days', actionLabel: 'Ledger', onAction: () => note('Notif → Ledger') },
    { id: 'sync', tone: 'info', icon: <TriangleAlert />, title: '4 events pending sync', meta: 'Retrying · next attempt in 12s', actionLabel: 'Retry', onAction: () => note('Notif → Retry') },
  ];

  const userMenu: UserMenuAction[] = [
    { id: 'profile', label: 'Profile', icon: <CircleUserRound />, onSelect: () => note('User: Profile') },
    { id: 'settings', label: 'Settings', icon: <Settings />, onSelect: () => note('User: Settings') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard />, shortcut: '?', onSelect: () => note('User: Shortcuts') },
    { id: 'logout', label: 'Log out', icon: <LogOut />, tone: 'danger', onSelect: () => note('User: Log out') },
  ];

  const commandGroups: CommandGroup[] = [
    {
      heading: 'Actions',
      items: [
        { id: 'c-expense', label: 'Record expense', icon: <Receipt />, shortcut: 'E', keywords: ['spend', 'cost'], onSelect: () => note('⌘K: Record expense') },
        { id: 'c-collection', label: 'Record collection', icon: <Wallet />, keywords: ['payment', 'receive'], onSelect: () => note('⌘K: Record collection') },
        { id: 'c-credit', label: 'New credit sale', icon: <CreditCard />, keywords: ['fleet', 'due'], onSelect: () => note('⌘K: New credit sale') },
        { id: 'c-dssr', label: 'Close business day · generate DSSR', icon: <FileText />, keywords: ['close', 'report', 'eod'], onSelect: () => note('⌘K: Close business day') },
      ],
    },
    {
      heading: 'Customers',
      items: [
        { id: 'cu-1', label: 'Karnataka State RTC', icon: <Users />, meta: 'KSR-041 · ₹12,84,320 due', keywords: ['ksr', 'rtc', 'bus'], onSelect: () => note('⌘K → Karnataka State RTC') },
        { id: 'cu-2', label: 'Sunrise Logistics Pvt Ltd', icon: <Users />, meta: 'SUN-018 · overdue', keywords: ['sunrise', 'logistics'], onSelect: () => note('⌘K → Sunrise Logistics') },
        { id: 'cu-3', label: 'Green Fields Farms', icon: <Users />, meta: 'GRF-007 · partial', keywords: ['green', 'farm'], onSelect: () => note('⌘K → Green Fields Farms') },
      ],
    },
    {
      heading: 'Go to',
      items: [
        { id: 'g-dash', label: 'Dashboard', icon: <ArrowUpRight />, onSelect: () => note('⌘K → Dashboard') },
        { id: 'g-reports', label: 'Reports', icon: <ArrowUpRight />, onSelect: () => note('⌘K → Reports') },
        { id: 'g-customers', label: 'Customers', icon: <ArrowUpRight />, onSelect: () => note('⌘K → Customers') },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-8 rounded-card border border-border-soft bg-surface-alt px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
        <strong className="text-ink-strong">Shell prototype — now live.</strong> The real pump-ds primitives (TopBar,
        CommandPalette, Radix menus) driven by demo data. Click <strong>Search</strong> or press <strong>⌘K</strong>;
        open <strong>+ New</strong>, the <strong>bell</strong>, or the <strong>avatar</strong>. Selections log below.
        This is exactly what gets wired into AppShell — station switcher stays a passive label (deferred).
      </div>

      <Group
        title="Top bar · interactive"
        description="Real component. Menus are Radix (focus trap, collision handling, keyboard, typeahead). Search opens the ⌘K palette. Everything is data-driven so AppShell just supplies state."
      >
        <div className="overflow-hidden rounded-card border border-border-soft">
          <TopBar
            onToggleSidebar={() => note('Toggle sidebar')}
            businessDate="09 Jul"
            businessDayStatus="open"
            onBusinessDay={() => note('Business day menu')}
            stationLabel="Indiranagar HP"
            onOpenSearch={() => setOpen(true)}
            quickCreate={quickCreate}
            notifications={notifications}
            syncStatus="online"
            userInitials="RS"
            userName="Rekha"
            userRole="Manager"
            userMenu={userMenu}
          />
          <div className="flex items-center justify-between bg-canvas px-4 py-6">
            <span className="text-[12px] text-ink-faint">page canvas</span>
            <span className="font-mono text-[11px] text-ink-muted">last action: <span className="text-ink-strong">{lastAction}</span></span>
          </div>
        </div>
      </Group>

      <Group
        title="Command palette · ⌘K"
        description="cmdk fuzzy filter + Radix Dialog. Type to filter across actions, customers, and pages; ↑↓ to move, ↵ to run, esc to close. Matches on labels, meta, and hidden keywords (try 'rtc' or 'eod')."
      >
        <div className="rounded-card border border-border-soft bg-canvas px-8 py-10 text-center">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-button border border-border-soft bg-surface px-3 py-2 text-[13px] text-ink-muted transition-colors hover:border-border-strong"
          >
            Open command palette
            <kbd className="inline-flex h-[18px] items-center gap-0.5 rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">⌘K</kbd>
          </button>
        </div>
      </Group>

      {/* The palette itself (portal-rendered) */}
      <CommandPalette open={open} onOpenChange={setOpen} groups={commandGroups} />
    </div>
  );
};
