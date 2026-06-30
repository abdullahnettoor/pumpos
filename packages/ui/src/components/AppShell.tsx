import React, { useState } from 'react';
import { SyncIndicator } from './SyncIndicator.js';
import { Station } from '@pump/shared';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  roles?: string[];
}

export interface AppShellProps {
  children: React.ReactNode;
  navItems: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
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
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
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
  environmentTag = null,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
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
        {/* Brand/Logo Section */}
        <div
          style={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--space-4)',
            borderBottom: '1px solid var(--border-soft)',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && (
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
              PumpOS
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--border-soft)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            )}
          </button>
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1, padding: 'var(--space-3) var(--space-2)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {visibleNavItems.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px var(--space-3)',
                  borderRadius: 'var(--radius-button)',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--state-info-bg)' : 'transparent',
                  color: isActive ? 'var(--state-info-fg)' : 'var(--text-default)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13px',
                  textAlign: 'left',
                  width: '100%',
                  gap: '12px',
                  transition: 'background-color 0.1s, color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--border-soft)';
                    e.currentTarget.style.color = 'var(--text-strong)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-default)';
                  }
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--state-info-fg)' : 'var(--text-muted)' }}>
                  {getIconSvg(item.label)}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User context footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>{userName}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {userRole}
              </span>
            </div>
          )}
          <button
            onClick={onLogout}
            style={{
              padding: '6px var(--space-3)',
              borderRadius: 'var(--radius-button)',
              border: '1px solid var(--border-soft)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-default)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '11px',
              width: '100%',
              textAlign: collapsed ? 'center' : 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-alt)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
          >
            {collapsed ? 'Exit' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main canvas area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, position: 'relative' }}>
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
        {/* Top Header details */}
        <header
          className="no-print"
          style={{
            height: '56px',
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-6)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {stations.length > 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>Station:</span>
                <select
                  value={selectedStation?.id || ''}
                  onChange={(e) => {
                    const target = stations.find((s) => s.id === e.target.value);
                    if (target && onStationChange) onStationChange(target);
                  }}
                  style={{
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-input)',
                    padding: '4px 24px 4px 8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    height: '28px',
                    backgroundColor: 'var(--bg-surface-alt)',
                    color: 'var(--text-strong)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span style={{ fontSize: '14px', color: 'var(--text-strong)', fontWeight: 600 }}>
                {selectedStation ? selectedStation.name : 'Workspace Setup'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <SyncIndicator status={syncStatus} pendingCount={pendingSyncCount} />
          </div>
        </header>

        {/* Content body layout */}
        <main className="app-shell__main" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
};
