import React, { useMemo, useState } from 'react';
import { AppTopBar } from './AppTopBar.js';
import { cn } from '../pump-ds/lib/cn.js';
import { Station } from '@pump/shared';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  roles?: string[];
}

/**
 * Optional intent passed alongside a navigation. Lets one screen (or the
 * command palette / quick-create) deep-link into another and have it open a
 * specific drawer or focus an entity on arrival. Screens consume the intent
 * once on mount/update and are expected to ignore stale intents.
 */
export interface NavIntent {
  /** Focus a specific customer (opens their statement drawer). */
  focusCustomerId?: string;
  /** Open a drawer immediately on arrival at the destination page. */
  open?: 'customer-statement' | 'new-customer' | 'new-collection';
}

export interface AppShellProps {
  children: React.ReactNode;
  navItems: NavItem[];
  currentPath: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
  userRole: string;
  userName: string;
  syncStatus: 'online' | 'offline' | 'synced' | 'pending' | 'failed';
  pendingSyncCount?: number;
  onLogout: () => void;
  stations?: Station[];
  selectedStation?: Station | null;
  onStationChange?: (station: Station) => void;
  environmentTag?: string | null;
}

// Inline SVGs for Navigation
const getIconSvg = (label: string) => {
  const size = 18;
  switch (label.toLowerCase()) {
    case 'dashboard':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      );
    case 'shifts':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 22V2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v20" />
          <path d="M15 2h5a2 2 0 0 1 2 2v13.5a2.5 2.5 0 0 1-5 0" />
          <circle cx="10" cy="8" r="2" />
          <path d="M15 22H3" />
        </svg>
      );
    case 'station overview':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'products catalog':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
          <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08" />
          <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08" />
          <polygon points="12 12 21 6.92 12 1.92 3 6.92 12 12" />
        </svg>
      );
    case 'storage tanks':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'dispenser units':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12" y2="18.01" />
          <line x1="9" y1="6" x2="15" y2="6" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      );
    case 'nozzles mapping':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
        </svg>
      );
    case 'shift templates':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'team roles':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'expenses':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case 'purchases':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'customers':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="5" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
      );
    case 'inventory':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'reports':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'fuel pricing':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="22" x2="15" y2="22" />
          <line x1="4" y1="9" x2="14" y2="9" />
          <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
          <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
        </svg>
      );
    case 'organization':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="14" rx="1" />
          <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
          <line x1="9" y1="11" x2="9" y2="11.01" />
          <line x1="15" y1="11" x2="15" y2="11.01" />
          <line x1="9" y1="15" x2="9" y2="15.01" />
          <line x1="15" y1="15" x2="15" y2="15.01" />
        </svg>
      );
    case 'accounts':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
          <path d="M16 12h.01" />
          <path d="M3 10h18" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
  }
};

/**
 * Sidebar section grouping. Items are matched to sections by `path`; order
 * within a section follows the `paths` order here. Anything unmatched falls
 * into a trailing group. Sections with no visible items are dropped.
 */
const NAV_GROUPS: { heading: string; paths: string[] }[] = [
  { heading: 'Operations', paths: ['/dashboard', '/shifts', '/inventory'] },
  { heading: 'Sales & CRM', paths: ['/customers'] },
  { heading: 'Purchasing', paths: ['/purchases', '/expenses'] },
  { heading: 'Finance', paths: ['/accounts', '/reports'] },
  { heading: 'Setup', paths: ['/setup/station', '/pricing', '/organization'] },
];

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
  selectedStation = null,
  environmentTag = null,
}) => {
  // Sidebar expanded by default; the top-bar hamburger collapses it to an icon rail.
  const [collapsed, setCollapsed] = useState(false);

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

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
      {/* Full-width top bar (pump-ds): hamburger + brand · business day · search · + New · notifications · sync · user */}
      <div className="no-print" style={{ flexShrink: 0 }}>
        <AppTopBar
          selectedStation={selectedStation}
          navItems={navItems}
          userRole={(userRole as 'Owner' | 'Manager' | 'Accountant' | 'Staff') || 'Staff'}
          userName={userName}
          syncStatus={syncStatus}
          pendingSyncCount={pendingSyncCount}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onToggleSidebar={() => setCollapsed((c) => !c)}
        />
      </div>

      {/* Body: sidebar rail + content canvas */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Sidebar Rail */}
        <aside
          className="no-print"
          style={{
            width: collapsed ? '72px' : '220px',
            backgroundColor: 'var(--bg-surface-alt)',
            borderRight: '1px solid var(--border-soft)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0,
          }}
        >
        {/* Navigation links — grouped, collapsible-friendly */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
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
                        'flex w-full items-center rounded-button text-[13px] transition-colors',
                        collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
                        isActive
                          ? 'bg-info-bg font-semibold text-info-fg'
                          : 'font-medium text-ink-default hover:bg-surface-alt hover:text-ink-strong',
                      )}
                    >
                      <span className={cn('flex items-center', isActive ? 'text-info-fg' : 'text-ink-muted')}>
                        {getIconSvg(item.label)}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

        {/* Content canvas */}
        <main className="app-shell__main" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', position: 'relative' }}>
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
          {children}
        </main>
      </div>
    </div>
  );
};
