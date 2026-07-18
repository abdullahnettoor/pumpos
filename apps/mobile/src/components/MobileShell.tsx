import React from 'react';
import type { Station } from '@pump/shared';
import { BottomNav, type TabKey } from './BottomNav.js';
import { StationPicker } from './StationPicker.js';
import { BusinessDayPill } from './BusinessDayPill.js';
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
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            P
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {title}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {userName} · {role}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
        >
          Sign out
        </button>
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
