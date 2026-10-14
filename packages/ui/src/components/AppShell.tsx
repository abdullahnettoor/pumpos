import React, { useEffect, useMemo, useState } from 'react';
import { AppTopBar } from './AppTopBar.js';
import { AppStatusBar } from './AppStatusBar.js';
import { cn } from '../pump-ds/lib/cn.js';
import { Icon } from '../pump-ds/icon/index.js';
import { Station, canViewReports, type OperatorRole, type Role } from '@pump/shared';
import { useContainerWidth } from '../hooks/useContainerWidth.js';
import { useStationBusinessDate } from '../hooks/useStationClock.js';
import { useSidebarBadges, type SidebarBadges } from '../query/useSidebarBadges.js';
import { NAV_GROUPS, ROUTES, navItemIcon } from '../nav-intent/routes.js';
import type { UserMenuAction } from '../pump-ds/shell/index.js';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  roles?: string[];
}

export type { NavIntent } from '../nav-intent/store.js';
import type { NavIntent } from '../nav-intent/store.js';
import { SubscriptionNotice } from '../access/SubscriptionNotice.js';

export interface AppShellProps {
  children: React.ReactNode;
  navItems: NavItem[];
  currentPath: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
  userRole: string;
  userName: string;
  syncStatus: 'online' | 'offline' | 'synced' | 'pending' | 'failed';
  pendingSyncCount?: number;
  onLogout: () => void | Promise<unknown>;
  stations?: Station[];
  selectedStation?: Station | null;
  /** Station list still in flight: the shell renders before it arrives, so
   *  the top bar holds the station chip open instead of popping it in. */
  stationsLoading?: boolean;
  onStationChange?: (station: Station) => void;
  environmentTag?: string | null;
  /** When false, the active station isn't operational yet (pre-onboarding hub):
   *  the top bar hides operational affordances (business day, quick-create,
   *  station alerts) and scopes search to org actions + navigation. */
  stationReady?: boolean;
  /**
   * Extra entries appended above "Log out" in the user menu.
   *
   * The desktop shell uses this for the installed version and "Check for
   * updates": in-app updates exist only in the packaged desktop app, so that
   * entry cannot live in the shared top bar, and the web console must never
   * grow a menu item it has no way to honour.
   */
  userMenuExtras?: UserMenuAction[];
  /** Installed app version, shown in the bottom status bar (desktop AND web). */
  appVersion?: string | null;
  /** Newer version available (desktop only): shows an update chip in the
   *  status bar. In-app updates exist only in the packaged desktop app. */
  updateAvailableVersion?: string | null;
  /** Phase-aware update-chip label (desktop only). Falls back to "Update to v…". */
  updateLabel?: string;
  /** Clicked when the status-bar update chip is used. Desktop only. */
  onUpdate?: () => void;
  /** Clicking the plain version runs a manual update check. Desktop only. */
  onCheckUpdates?: () => void;
  /** A manual check is running: the version reads "Checking…". */
  checkingUpdates?: boolean;
}

/** Below this app (shell) width the sidebar becomes a 60px icon rail on its own. */
export const RAIL_BREAKPOINT = 1200;
export const SIDEBAR_COLLAPSED_KEY = 'pump.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type BadgeTone = 'success' | 'warning' | 'danger';

/**
 * Live sidebar badges, keyed by nav path. `read` returns the label and either
 * a count or a dot, or null when there is nothing to show. Tones follow the
 * prototype: Inventory danger, Customers / Reports warning, running shift a
 * success dot.
 */
const NAV_BADGES: Record<
  string,
  { tone: BadgeTone; read: (b: SidebarBadges) => { label: string; count?: number } | null }
> = {
  [ROUTES.shifts]: {
    tone: 'success',
    read: (b) => (b.shiftRunning ? { label: 'Shift running' } : null),
  },
  [ROUTES.inventory]: {
    tone: 'danger',
    read: (b) =>
      b.inventoryAlerts > 0
        ? { label: `${b.inventoryAlerts} inventory alerts`, count: b.inventoryAlerts }
        : null,
  },
  [ROUTES.customers]: {
    tone: 'warning',
    read: (b) =>
      b.overdueCustomers > 0
        ? { label: `${b.overdueCustomers} overdue customers`, count: b.overdueCustomers }
        : null,
  },
  [ROUTES.reports]: {
    tone: 'warning',
    read: (b) =>
      b.openPastDays > 0
        ? { label: `${b.openPastDays} open past days`, count: b.openPastDays }
        : null,
  },
};

const BADGE_DOT: Record<BadgeTone, string> = {
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  danger: 'bg-danger-fg',
};
const BADGE_CHIP: Record<BadgeTone, string> = {
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
};

/** The live badge for a nav item, or null. Dot on a rail, count/dot beside the label. */
function renderBadge(path: string, b: SidebarBadges, collapsed: boolean): React.ReactNode {
  const entry = NAV_BADGES[path];
  const badge = entry?.read(b);
  if (!entry || !badge) return null;
  const { tone } = entry;
  const testId = `nav-badge-${path.slice(1)}`;

  if (badge.count === undefined || collapsed) {
    return (
      <span
        role="img"
        aria-label={badge.label}
        data-testid={testId}
        className={cn(
          'size-1.5 rounded-full',
          BADGE_DOT[tone],
          collapsed ? 'absolute right-2 top-1.5' : 'ml-auto',
        )}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={badge.label}
      data-testid={testId}
      className={cn(
        'ml-auto inline-flex min-w-[18px] items-center justify-center rounded-chip px-1.5 font-mono text-[10px] font-medium',
        BADGE_CHIP[tone],
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  navItems,
  currentPath,
  onNavigate,
  userRole,
  userName,
  syncStatus,
  pendingSyncCount = 0,
  onLogout,
  stations = [],
  selectedStation = null,
  onStationChange,
  stationsLoading = false,
  environmentTag = null,
  stationReady = true,
  userMenuExtras,
  appVersion,
  updateAvailableVersion,
  updateLabel,
  onUpdate,
  onCheckUpdates,
  checkingUpdates,
}) => {
  // Expanded by default. The Collapse control at the sidebar foot toggles an
  // icon rail and the choice is remembered per device; below RAIL_BREAKPOINT
  // the rail is forced regardless (without overwriting the saved choice).
  const [userCollapsed, setUserCollapsed] = useState(readCollapsed);
  const [shellRef, shellWidth] = useContainerWidth<HTMLDivElement>();
  // 0 = not measured yet: stay expanded rather than flash a rail.
  const narrow = shellWidth > 0 && shellWidth < RAIL_BREAKPOINT;
  const collapsed = userCollapsed || narrow;
  const toggleCollapsed = () => {
    const next = !userCollapsed;
    setUserCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  };

  const businessDate = useStationBusinessDate(selectedStation?.settings);
  const badges = useSidebarBadges(
    selectedStation?.id,
    stationReady && !!selectedStation,
    // Money alerts (overdue customers, open past days) follow Reports access.
    canViewReports(userRole as Role),
    businessDate,
  );

  // App-wide: stop mouse-wheel from changing a focused number input's value
  // (a common source of accidental edits while scrolling). Blurring the input on
  // wheel keeps page scrolling intact while preventing the value change.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement as HTMLInputElement | null;
      if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) {
        el.blur();
      }
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  const visibleNavItems = navItems.filter((item) => !item.roles || item.roles.includes(userRole));

  // Bucket the flat nav list into ordered sections. Items not mapped to any
  // section fall into a trailing group (unlabelled when it's the ONLY group,
  // e.g. onboarding mode; "More" otherwise, e.g. the dev Design System link).
  const groupedNav = useMemo(() => {
    const used = new Set<string>();
    const groups = NAV_GROUPS.map((g) => ({
      heading: g.heading,
      items: g.paths
        .map((p) => visibleNavItems.find((n) => n.path === p))
        .filter((n): n is NavItem => Boolean(n)),
    })).filter((g) => g.items.length > 0);
    groups.forEach((g) => g.items.forEach((it) => used.add(it.path)));
    const rest = visibleNavItems.filter((n) => !used.has(n.path));
    if (rest.length) {
      groups.push({ heading: rest.length === visibleNavItems.length ? '' : 'More', items: rest });
    }
    return groups;
  }, [visibleNavItems]);

  return (
    <div
      ref={shellRef}
      className="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Full-width top bar (pump-ds): hamburger + brand · station · search · + New · notifications · user */}
      <div className="no-print" style={{ flexShrink: 0 }}>
        <AppTopBar
          selectedStation={selectedStation}
          navItems={navItems}
          userRole={(userRole as OperatorRole) || 'Staff'}
          userName={userName}
          syncStatus={syncStatus}
          pendingSyncCount={pendingSyncCount}
          onNavigate={onNavigate}
          onLogout={onLogout}
          stations={stations}
          onStationChange={onStationChange}
          pageLabel={visibleNavItems.find((n) => n.path === currentPath)?.label}
          stationReady={stationReady}
          userMenuExtras={userMenuExtras}
        />
      </div>

      {/* Body: sidebar rail + content canvas */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Sidebar Rail */}
        <aside
          className="no-print"
          style={{
            width: collapsed ? '60px' : '220px',
            backgroundColor: 'var(--bg-surface-alt)',
            borderRight: '1px solid var(--border-soft)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0,
          }}
        >
          {/* Navigation links — grouped, collapsible-friendly */}
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
            {groupedNav.map((group, gi) => (
              <div key={group.heading || `grp-${gi}`} className={gi > 0 ? 'mt-4' : ''}>
                {!collapsed && group.heading && (
                  <div className="px-2 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                    {group.heading}
                  </div>
                )}
                {collapsed && gi > 0 && <div className="mx-2 mb-2 h-px bg-border-soft" />}
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = currentPath === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => onNavigate(item.path)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'relative flex w-full items-center rounded-button text-[13px] transition-colors',
                          collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
                          isActive
                            ? 'bg-info-bg font-semibold text-info-fg'
                            : 'font-medium text-ink-default hover:bg-surface-alt hover:text-ink-strong',
                        )}
                      >
                        <span
                          className={cn(
                            'flex items-center',
                            isActive ? 'text-info-fg' : 'text-ink-muted',
                          )}
                        >
                          <Icon name={navItemIcon(item.icon)} size="md" />
                        </span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {renderBadge(item.path, badges, collapsed)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          {/* Sidebar foot: same row style as the nav items above (prototype). */}
          <div className="px-2 pb-2 pt-1">
            <button
              type="button"
              onClick={toggleCollapsed}
              disabled={narrow}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : undefined}
              className={cn(
                'flex w-full items-center rounded-button py-2 text-[13px] font-medium text-ink-default transition-colors hover:bg-surface-alt hover:text-ink-strong disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
              )}
            >
              <span className="flex items-center text-ink-muted">
                <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} size="md" />
              </span>
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Content canvas */}
        <main
          className="app-shell__main"
          style={{
            flex: 1,
            overflowY: 'auto',
            // Keep the full padding on every side: full-bleed children (e.g. the
            // sticky shift control bar's backdrop) extend by exactly
            // var(--space-6), so a trimmed right padding would overflow and add a
            // horizontal scroll.
            padding: 'var(--space-6)',
            position: 'relative',
          }}
        >
          {environmentTag ? (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                zIndex: 20,
                height: '22px',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 8px',
                borderRadius: '999px',
                border: '1px solid rgba(250, 204, 21, 0.45)',
                backgroundColor: 'rgba(250, 204, 21, 0.14)',
                color: '#854d0e',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                pointerEvents: 'none',
              }}
            >
              {environmentTag}
            </div>
          ) : null}
          {/* Subscription state is app-wide, so the notice sits above every
              screen rather than being remembered on each one. */}
          <SubscriptionNotice />
          {children}
        </main>
      </div>

      {/* Bottom status bar (pump-ds): sync · business day · warnings · shift · version/update */}
      <div className="no-print" style={{ flexShrink: 0 }}>
        <AppStatusBar
          selectedStation={selectedStation}
          syncStatus={syncStatus}
          pendingSyncCount={pendingSyncCount}
          onNavigate={onNavigate}
          stationReady={stationReady}
          appVersion={appVersion}
          updateAvailableVersion={updateAvailableVersion}
          updateLabel={updateLabel}
          onUpdate={onUpdate}
          onCheckUpdates={onCheckUpdates}
          checkingUpdates={checkingUpdates}
        />
      </div>
    </div>
  );
};
