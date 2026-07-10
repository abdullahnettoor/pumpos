import React, { forwardRef, type ReactNode } from 'react';
import { Menu as MenuIcon, Search, Bell, ChevronDown, Command as CommandIcon, Fuel } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Button } from '../button/index.js';
import { SyncPulse, type SyncStatus } from '../sync-pulse/index.js';
import { BusinessDayChip } from '../business-day/index.js';
import {
  Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel,
} from '../menu/index.js';

/**
 * TopBar — the app-shell top bar. Composes pump-ds primitives into the real,
 * wired header: sidebar toggle · business-day anchor · (deferred) station
 * label · global search trigger (⌘K) · + New · notifications · sync pulse ·
 * user menu.
 *
 * Fully controlled/data-driven so AppShell can wire it to real state without
 * the TopBar knowing about routing, queries, or auth.
 */

export interface QuickCreateAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface NotificationItem {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  icon?: ReactNode;
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface UserMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

export interface TopBarProps {
  onToggleSidebar?: () => void;

  /** Brand mark rendered at the far left (next to the sidebar toggle). */
  brand?: ReactNode;

  businessDate: string;
  businessDayStatus: 'open' | 'closed';
  onBusinessDay?: () => void;

  /** Single-station label (switcher deferred). Omit to hide. */
  stationLabel?: string;

  /** Opens the command palette. */
  onOpenSearch: () => void;
  searchPlaceholder?: string;

  quickCreate?: QuickCreateAction[];

  notifications?: NotificationItem[];

  syncStatus: SyncStatus;
  pendingSyncCount?: number;

  userInitials: string;
  userName: string;
  userRole: string;
  userMenu: UserMenuAction[];

  className?: string;
}

const IconBtn = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number }>(
  function IconBtn({ className, children, badge, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn('relative inline-flex size-8 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink-strong', className)}
        {...props}
      >
        {children}
        {badge != null && badge > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-danger-fg px-1 text-[9px] font-bold leading-[14px] text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
    );
  },
);

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  brand,
  businessDate,
  businessDayStatus,
  onBusinessDay,
  stationLabel,
  onOpenSearch,
  searchPlaceholder = 'Search customers, invoices, shifts…',
  quickCreate = [],
  notifications = [],
  syncStatus,
  pendingSyncCount = 0,
  userInitials,
  userName,
  userRole,
  userMenu,
  className,
}) => {
  const notifCount = notifications.length;

  return (
    <div className={cn('flex h-14 items-center gap-3 border-b border-border-soft bg-surface px-3', className)}>
      {onToggleSidebar && (
        <IconBtn onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <MenuIcon className="size-[18px]" />
        </IconBtn>
      )}

      {brand && (
        <div className="select-none pl-0.5 pr-1 text-[15px] font-bold tracking-[-0.01em] text-brand">{brand}</div>
      )}

      <BusinessDayChip date={businessDate} status={businessDayStatus} onClick={onBusinessDay} />

      {stationLabel && (
        <div className="hidden items-center gap-1.5 rounded-button px-2 text-[12px] text-ink-muted lg:inline-flex" title="Single station">
          <Fuel className="size-3.5" />
          <span>{stationLabel}</span>
        </div>
      )}

      {/* Global search trigger */}
      <button
        onClick={onOpenSearch}
        className="group flex h-9 max-w-[420px] flex-1 items-center gap-2 rounded-button border border-border-soft bg-canvas px-3 text-[12.5px] text-ink-muted transition-colors hover:border-border-strong"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
        <span className="flex items-center gap-0.5">
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong"><CommandIcon className="size-2.5" /></kbd>
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">K</kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {quickCreate.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="primary" size="sm" leftIcon={<span className="text-[15px] leading-none">+</span>}>New</Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Create</MenuLabel>
              {quickCreate.map((a) => (
                <MenuItem key={a.id} icon={a.icon} shortcut={a.shortcut} onSelect={a.onSelect}>{a.label}</MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}

        {/* Notifications */}
        <Menu>
          <MenuTrigger asChild>
            <IconBtn aria-label={`Notifications (${notifCount})`} badge={notifCount}>
              <Bell className="size-[18px]" />
            </IconBtn>
          </MenuTrigger>
          <MenuContent align="end" className="w-[320px] py-0">
            <div className="flex items-center justify-between border-b border-border-soft px-3 py-2.5">
              <span className="text-[12px] font-semibold text-ink-strong">Notifications</span>
              {notifCount > 0 && <span className="inline-flex items-center rounded-chip bg-danger-bg px-1.5 py-0.5 text-[10px] font-medium text-danger-fg">{notifCount} new</span>}
            </div>
            {notifCount === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-ink-muted">Nothing needs attention.</div>
            ) : (
              <div className="divide-y divide-border-soft">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={n.onAction}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-alt"
                  >
                    <span className={cn('mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
                      n.tone === 'danger' ? 'bg-danger-bg text-danger-fg' : n.tone === 'warning' ? 'bg-warning-bg text-warning-fg' : 'bg-info-bg text-info-fg')}
                    >
                      {n.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-ink-strong">{n.title}</span>
                      {n.meta && <span className="block text-[11px] text-ink-muted">{n.meta}</span>}
                    </span>
                    {n.actionLabel && <span className="shrink-0 self-center font-mono text-[10px] uppercase tracking-wide text-brand">{n.actionLabel}</span>}
                  </button>
                ))}
              </div>
            )}
          </MenuContent>
        </Menu>

        <SyncPulse status={syncStatus} pendingCount={pendingSyncCount} />

        <div className="mx-0.5 h-5 w-px bg-border-soft" />

        {/* User menu */}
        <Menu>
          <MenuTrigger asChild>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-button pl-1 pr-1.5 transition-colors hover:bg-surface-alt">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand">{userInitials}</span>
              <span className="hidden text-[12px] font-medium text-ink-strong sm:inline">{userName}</span>
              <ChevronDown className="size-3.5 text-ink-faint" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand/12 text-[12px] font-semibold text-brand">{userInitials}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink-strong">{userName}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">{userRole}</div>
              </div>
            </div>
            <MenuSeparator />
            {userMenu.map((a) => (
              <MenuItem key={a.id} icon={a.icon} shortcut={a.shortcut} tone={a.tone} onSelect={a.onSelect}>{a.label}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
};
