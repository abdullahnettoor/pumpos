import React, { useEffect, useMemo, useState } from 'react';
import { Login, useStations, useMyAssignment } from '@pump/ui';
import type { Station } from '@pump/shared';
import { resolveBusinessDate } from '@pump/shared';
import { useSession, signOut, type UserRole } from './lib/session.js';
import { MobileShell } from './components/MobileShell.js';
import type { TabKey } from './components/BottomNav.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ShiftsScreen } from './screens/ShiftsScreen.js';
import { DssrScreen } from './screens/DssrScreen.js';
import { LedgerScreen } from './screens/LedgerScreen.js';
import { MoreScreen } from './screens/MoreScreen.js';
import { AttendantScreen } from './screens/AttendantScreen.js';
import { HandoverPanel } from './components/HandoverPanel.js';

/** Tabs each role may access on mobile. */
const TABS_BY_ROLE: Record<UserRole, TabKey[]> = {
  Owner: ['home', 'shifts', 'dssr', 'ledger', 'more'],
  Manager: ['shifts', 'dssr', 'ledger', 'more'],
  Accountant: ['dssr', 'ledger'],
  Staff: [],
  Attendant: [], // Attendants use their own dedicated handover shell, not tabs.
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-8 text-center"
    style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-default)' }}
  >
    {children}
  </div>
);

export const App: React.FC = () => {
  const { status, role, userName, error } = useSession();
  const stationsQ = useStations({ enabled: status === 'ready' });
  const stations = (stationsQ.data || []) as Station[];

  // Non-attendant roles who happen to be assigned to a DU on an open shift get an
  // extra "My handover" tab with the same self-service UI as the Attendant shell.
  const myAssignmentQ = useMyAssignment({ enabled: status === 'ready' && role !== 'Attendant' });
  const hasHandoverTab = role !== 'Attendant' && !!myAssignmentQ.data;

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('home');

  const allowedTabs = useMemo<TabKey[]>(() => {
    const base = role ? TABS_BY_ROLE[role] : [];
    return hasHandoverTab ? [...base, 'handover'] : base;
  }, [role, hasHandoverTab]);

  // Default the station once loaded.
  useEffect(() => {
    if (!selectedStationId && stations.length > 0) setSelectedStationId(stations[0].id);
  }, [stations, selectedStationId]);

  // Keep the active tab within what the role + view allows.
  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.includes(tab)) setTab(allowedTabs[0]);
  }, [allowedTabs, tab]);

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? null,
    [stations, selectedStationId],
  );

  // Global business-day navigation (MB1). `todayBiz` is the station's current
  // business date; the pill lets the user page back to any prior day.
  const stationSettings: any = (selectedStation as any)?.settings || {};
  const todayBiz = selectedStation
    ? resolveBusinessDate({ timeZone: stationSettings.timezone, dayStartsAt: stationSettings.business_day_starts_at })
    : undefined;
  const [bizDate, setBizDate] = useState<string | null>(null);
  useEffect(() => {
    if (todayBiz && !bizDate) setBizDate(todayBiz);
  }, [todayBiz, bizDate]);
  // Clamp a stale selection if the day rolled over past what's now selectable.
  useEffect(() => {
    if (todayBiz && bizDate && bizDate > todayBiz) setBizDate(todayBiz);
  }, [todayBiz, bizDate]);
  const businessDate = bizDate ?? todayBiz ?? null;
  const showBusinessDay = tab === 'home' || tab === 'dssr';

  if (status === 'loading') {
    return (
      <Centered>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connecting…</p>
      </Centered>
    );
  }

  if (status === 'signed-out') {
    return <Login />;
  }

  if (status === 'error') {
    return (
      <Centered>
        <p className="text-4xl">⚠️</p>
        <p className="font-semibold">Couldn't load your account</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error?.message}</p>
      </Centered>
    );
  }

  // Attendants get a dedicated mobile-only handover shell (no owner tabs).
  if (role === 'Attendant') {
    return <AttendantScreen userName={userName} onSignOut={() => signOut()} />;
  }

  if (allowedTabs.length === 0) {
    return (
      <Centered>
        <p className="text-4xl">🔒</p>
        <p className="font-semibold">Mobile access is limited</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The PumpOS mobile app is for owners and managers. Please use the desktop console.
        </p>
      </Centered>
    );
  }

  const titleByTab: Record<TabKey, string> = {
    home: 'Overview',
    shifts: 'Shifts',
    dssr: 'Daily report',
    ledger: 'Money',
    handover: 'My handover',
    more: 'Insights',
  };

  const renderScreen = () => {
    if (tab === 'handover') return <HandoverPanel />;
    if (tab === 'ledger') return <LedgerScreen />;
    if (!selectedStation) {
      return (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {stationsQ.isLoading ? 'Loading stations…' : 'No stations available.'}
        </p>
      );
    }
    if (tab === 'home') return <HomeScreen station={selectedStation} businessDate={businessDate} onNavigate={setTab} />;
    if (tab === 'shifts') return <ShiftsScreen station={selectedStation} />;
    if (tab === 'dssr') return <DssrScreen station={selectedStation} businessDate={businessDate} />;
    if (tab === 'more') return <MoreScreen station={selectedStation} onNavigate={setTab} />;
    return null;
  };

  return (
    <MobileShell
      userName={userName}
      role={role ?? ''}
      stations={stations}
      selectedStationId={selectedStationId}
      onSelectStation={setSelectedStationId}
      activeTab={tab}
      onChangeTab={setTab}
      allowedTabs={allowedTabs}
      title={titleByTab[tab]}
      businessDate={businessDate}
      maxBusinessDate={todayBiz ?? null}
      onChangeBusinessDate={setBizDate}
      showBusinessDay={showBusinessDay}
    >
      {renderScreen()}
    </MobileShell>
  );
};
