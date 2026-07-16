import React, { useEffect, useMemo, useState } from 'react';
import { Login, useStations } from '@pump/ui';
import type { Station } from '@pump/shared';
import { useSession, type UserRole } from './lib/session.js';
import { MobileShell } from './components/MobileShell.js';
import type { TabKey } from './components/BottomNav.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ShiftsScreen } from './screens/ShiftsScreen.js';
import { DssrScreen } from './screens/DssrScreen.js';
import { LedgerScreen } from './screens/LedgerScreen.js';

/** Tabs each role may access on mobile. */
const TABS_BY_ROLE: Record<UserRole, TabKey[]> = {
  Owner: ['home', 'shifts', 'dssr', 'ledger'],
  Manager: ['shifts', 'dssr', 'ledger'],
  Accountant: ['dssr', 'ledger'],
  Staff: [],
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

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('home');

  const allowedTabs = role ? TABS_BY_ROLE[role] : [];

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
    ledger: 'Ledger',
  };

  const renderScreen = () => {
    if (tab === 'ledger') return <LedgerScreen />;
    if (!selectedStation) {
      return (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {stationsQ.isLoading ? 'Loading stations…' : 'No stations available.'}
        </p>
      );
    }
    if (tab === 'home') return <HomeScreen station={selectedStation} />;
    if (tab === 'shifts') return <ShiftsScreen station={selectedStation} />;
    if (tab === 'dssr') return <DssrScreen station={selectedStation} />;
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
    >
      {renderScreen()}
    </MobileShell>
  );
};
