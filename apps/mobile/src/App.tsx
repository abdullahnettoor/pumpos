import React, { useMemo, useState } from 'react';
import { BootScreen, Login, useStations, runTask } from '@pump/ui';
import type { Station } from '@pump/shared';
import { useOwnHandover } from './lib/handover/useOwnHandover.js';
import { useSession, signOut } from './lib/session.js';
import { MobileShell } from './shell/MobileShell.js';
import { NavProvider } from './shell/nav.js';
import { TabRoot } from './shell/TabRoot.js';
import { tabsForRole } from './shell/tabs.js';
import { AttendantScreen } from './screens/AttendantScreen.js';

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-8 text-center"
    style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-default)' }}
  >
    {children}
  </div>
);

/** Recovery action for dead-end screens (error / no access) that render outside
 *  the shell, so a stuck user can always sign out. Sign-out also clears the
 *  persisted cache (see session.ts), which resolves stale-cache lockouts. */
const SignOutButton: React.FC = () => (
  <button
    onClick={() => runTask(signOut(), (error: unknown) => console.error('Sign out failed:', error))}
    className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold"
    style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-accent)' }}
  >
    Sign out
  </button>
);

export const App: React.FC = () => {
  const { status, role, userName, error } = useSession();
  const stationsQ = useStations({ enabled: status === 'ready' });
  const stations = useMemo(() => (stationsQ.data || []) as Station[], [stationsQ.data]);

  // Non-attendant roles who happen to be assigned to a DU on an open shift get a
  // pinned handover card on Home (the same self-service form as the Attendant shell).
  const hasHandover = useOwnHandover(status === 'ready' && role !== 'Attendant') !== null;
  const allowedTabs = useMemo(() => tabsForRole(role, hasHandover), [role, hasHandover]);

  // The operator's pick, falling back to the first station until stations load.
  // Derived rather than synced by an effect, so the fallback is right on first render.
  const [pickedStationId, setPickedStationId] = useState<string | null>(null);
  const selectedStationId = pickedStationId ?? stations[0]?.id ?? null;
  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? null,
    [stations, selectedStationId],
  );

  // Same branded screen desktop and console show, so the wait looks like one
  // product rather than three. It replaced "Connecting…", which named the
  // network rather than what the operator is waiting for.
  if (status === 'loading') {
    return <BootScreen />;
  }

  if (status === 'signed-out') {
    return <Login />;
  }

  if (status === 'error') {
    return (
      <Centered>
        <p className="text-4xl">⚠️</p>
        <p className="font-semibold">Couldn't load your account</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {error?.message}
        </p>
        <SignOutButton />
      </Centered>
    );
  }

  const onSignOut = () =>
    runTask(signOut(), (error: unknown) => console.error('Sign out failed:', error));

  // Attendants get a dedicated mobile-only handover shell (no owner tabs).
  if (role === 'Attendant') {
    return <AttendantScreen userName={userName} onSignOut={onSignOut} />;
  }

  if (!role || allowedTabs.length === 0) {
    return (
      <Centered>
        <p className="text-4xl">🔒</p>
        <p className="font-semibold">Mobile access is limited</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The PumpOS mobile app is for owners and managers. Please use the desktop console.
        </p>
        <SignOutButton />
      </Centered>
    );
  }

  return (
    <NavProvider tabs={allowedTabs}>
      <MobileShell
        userName={userName}
        role={role}
        stations={stations}
        selectedStationId={selectedStationId}
        onSelectStation={setPickedStationId}
        onSignOut={onSignOut}
        renderRoot={(tab) => (
          <TabRoot tab={tab} station={selectedStation} stationsLoading={stationsQ.isLoading} />
        )}
      />
    </NavProvider>
  );
};
