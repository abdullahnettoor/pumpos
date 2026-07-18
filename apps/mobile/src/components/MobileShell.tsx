import React from 'react';
import type { Station } from '@pump/shared';
import { BottomNav, type TabKey } from './BottomNav.js';
import { StationPicker } from './StationPicker.js';
import { BusinessDayPill } from './BusinessDayPill.js';
import { AccountMenu } from './AccountMenu.js';
import { signOut } from '../lib/session.js';

interface MobileShellProps {
  userName: string;
  role: string;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  activeTab: TabKey;
  onChangeTab: (key: TabKey) => void;
  allowedTabs: TabKey[];
  title: string;
  /** Business-day navigator (shown only on day-scoped tabs). */
  businessDate?: string | null;
  maxBusinessDate?: string | null;
  onChangeBusinessDate?: (date: string) => void;
  showBusinessDay?: boolean;
  children: React.ReactNode;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  userName,
  role,
  stations,
  selectedStationId,
  onSelectStation,
  activeTab,
  onChangeTab,
  allowedTabs,
  title,
  businessDate,
  maxBusinessDate,
  onChangeBusinessDate,
  showBusinessDay,
  children,
}) => (
  <div className="flex h-[100dvh] flex-col" style={{ backgroundColor: 'var(--bg-canvas)' }}>
    <header
      className="mobile-safe-top sticky top-0 z-20 border-b"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            P
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {stations.find((s) => s.id === selectedStationId)?.name ?? 'PumpOS'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{title}</p>
          </div>
        </div>
        <AccountMenu
          userName={userName}
          role={role}
          stationName={stations.find((s) => s.id === selectedStationId)?.name}
          onSignOut={() => signOut()}
        />
      </div>
      <StationPicker
        stations={stations}
        selectedId={selectedStationId}
        onSelect={onSelectStation}
      />
      {showBusinessDay && businessDate && maxBusinessDate && onChangeBusinessDate && (
        <div className="px-4 pb-2">
          <BusinessDayPill value={businessDate} max={maxBusinessDate} onChange={onChangeBusinessDate} />
        </div>
      )}
    </header>

    <main className="flex-1 overflow-y-auto px-4 py-4">{children}</main>

    <BottomNav active={activeTab} onChange={onChangeTab} allowed={allowedTabs} />
  </div>
);
