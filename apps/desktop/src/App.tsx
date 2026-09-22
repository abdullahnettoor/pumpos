import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppShell,
  BootScreen,
  SkeletonGrid,
  Login,
  WebOnboardingNotice,
  StationOverview,
  DashboardOverview,
  OrganizationOverview,
  ShiftsManagement,
  ExpensesList,
  IncomeList,
  PurchasesList,
  CustomersList,
  InventoryList,
  ReportsOverview,
  FuelPricingPanel,
  AccountsPanel,
  DesignSystem,
  QuickEntryHost,
  CloudStationService,
  onboardingProvisionedQueryKeys,
  queryKeys,
  stationsQueryOptions,
  selectBootGate,
  useSelectedStation,
  startSessionBoot,
  setApiBaseUrl,
  setAuthToken,
  installSupabaseTokenSource,
  clearClientSessionData,
  clearStoredOnboardingDraft,
  supabase,
  startSession,
  keepSessionFresh,
  useRunTask,
  publishNavIntent,
} from '@pump/ui';
import { REPORTS_ROLES, Station } from '@pump/shared';
import { environmentTag, showDeveloperSurfaces } from './buildEnv.js';
import { useDesktopUpdates } from './updates/useDesktopUpdates.js';
import { UpdateNotice } from './updates/UpdateNotice.js';

setApiBaseUrl(import.meta.env.VITE_API_URL);

// Requests resolve the live session token per call rather than a stale snapshot.
installSupabaseTokenSource();

// Onboarding is done on the web console only; the desktop app links users there
// and unlocks automatically once the station is READY_FOR_OPERATIONS. Override
// the target with VITE_WEB_URL for dev/preview builds.
const webConsoleUrl =
  (import.meta.env.VITE_WEB_URL as string | undefined) || 'https://console.pumpos.app';

const stationService = new CloudStationService();

// The environment badge and the developer-only Design System page both key off
// the value baked into the bundle at build time — never off the serving host,
// which is `localhost` in every packaged desktop build (#116). See buildEnv.ts.

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard');
  // Deep-link intents travel through the nav-intent store; see console/App.tsx.
  const navigate = useCallback((path: string, intent?: import('@pump/ui').NavIntent) => {
    setCurrentPath(path);
    publishNavIntent(intent);
  }, []);
  const [syncStatus, setSyncStatus] = useState<
    'online' | 'offline' | 'synced' | 'pending' | 'failed'
  >(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online');

  // Reflect real browser network status in the top-bar indicator.
  useEffect(() => {
    const update = () => setSyncStatus(navigator.onLine ? 'online' : 'offline');
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);

  // Supabase Auth and Backend user context states
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<'Owner' | 'Manager' | 'Accountant' | 'Staff' | null>(
    null,
  );
  const [userName, setUserName] = useState<string>('');
  const [profileError, setProfileError] = useState<string | null>(null);

  const { stations, selectedStation, pickStation, stationsLoading } = useSelectedStation(!!session);

  const lastUserIdRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);
  const qc = useQueryClient();
  const runTask = useRunTask();

  const handleSession = async (currentSession: any) => {
    const isSameUser = lastUserIdRef.current === (currentSession?.user?.id || null);
    setSession(currentSession);
    setProfileError(null);

    if (currentSession) {
      // Pass the JWT token to our request headers wrapper
      setAuthToken(currentSession.access_token);

      // If it's the same user session and we've already resolved permissions, skip resetting/re-fetching
      // (uses a ref, not the captured `userRole`, to avoid a stale-closure flash on tab refocus).
      if (isSameUser && resolvedRef.current) {
        return;
      }

      // Account switch within the same tab: purge the previous user's cached
      // (and persisted) data so their stations/products never bleed through.
      if (lastUserIdRef.current && lastUserIdRef.current !== currentSession.user.id) {
        clearClientSessionData(qc);
        clearStoredOnboardingDraft();
      }

      lastUserIdRef.current = currentSession.user.id;
      pickStation(null);

      try {
        setLoading(true);
        // Both requests go out together. The station list needs the JWT (set
        // just above), not the resolved role, so there is nothing to wait for —
        // and only the session is awaited, because only the session gates the
        // shell. Stations land in the query cache that `useStations` reads.
        const sessionData = await startSessionBoot({
          loadSession: () => stationService.getCurrentSession(),
          prefetchStations: () => qc.prefetchQuery(stationsQueryOptions()),
        });
        // A session with no role would otherwise strand the operator: the gate
        // holds the boot screen while the role is null, and that screen has no
        // sign-out. Treat it as a failed lookup so they get the error card and
        // its escape hatch instead of a spinner that never resolves.
        if (!sessionData.user.role) {
          throw new Error('Your account has no role assigned. Ask an Owner to grant access.');
        }
        setUserRole(sessionData.user.role);
        resolvedRef.current = true;
        setUserName(sessionData.user.fullName?.trim() || sessionData.user.email);

        // Leave the login route as soon as we know who the user is, rather than
        // waiting on the station list the way this used to. Nothing here needs
        // stations: an unonboarded station is handled by the render gate, which
        // owns that decision once the list settles.
        setCurrentPath((prev) => (prev === '/login' ? '/dashboard' : prev));
      } catch (err: any) {
        console.error('Failed to resolve backend profile:', err);
        setProfileError(err.message || 'Verification failed. Profile not found.');
        setUserRole(null);
        resolvedRef.current = false;
        lastUserIdRef.current = null;
      } finally {
        setLoading(false);
      }
    } else {
      // Clear token and states
      lastUserIdRef.current = null;
      resolvedRef.current = false;
      setAuthToken('');
      pickStation(null);
      setUserRole(null);
      setUserName('');
      setLoading(false);
      setCurrentPath('/login');
      // Wipe all cached + persisted data so the next user starts from a clean
      // slate (prevents cross-user data bleed and stale "station not found").
      clearClientSessionData(qc);
      clearStoredOnboardingDraft();
    }
  };

  // handleSession is re-created on every render, so the subscription reads it
  // through a ref rather than depending on it — depending on it would tear down
  // and re-establish the auth listener on every render.
  const handleSessionRef = useRef(handleSession);
  useEffect(() => {
    handleSessionRef.current = handleSession;
  });

  useEffect(() => {
    // Desktop is the resilience tier and the most likely to start on a flaky
    // connection, so the failed-read fallback matters most here. It lives in
    // startSession (@pump/ui) and is covered by its own tests.
    const { stop } = startSession((session) => handleSessionRef.current(session));
    return stop;
  }, []);

  useEffect(() => {
    // A desktop window parked behind another gets its timers throttled, so
    // Supabase's refresh can miss and the token expires in place. Drive the
    // refresh from focus/visibility instead, so returning to an idle window
    // never greets the operator with an auth error.
    return keepSessionFresh();
  }, []);

  /**
   * In-app updates (desktop only). The automatic check fires once the
   * authenticated shell is up — never during boot, and never from a dev or web
   * build. A failed check lands in the coordinator's state, so nothing here can
   * delay or break the operator's start-up.
   */
  const shellReady = !!session && !!userRole && !profileError;
  const updates = useDesktopUpdates(shellReady);
  const updateMenuEntries = updates.enabled
    ? [
        {
          id: 'check-updates',
          label: 'Check for updates',
          // The installed version rides in the shortcut slot, so one entry both
          // reports where the operator is and offers the check.
          shortcut: updates.currentVersion ? `v${updates.currentVersion}` : undefined,
          onSelect: updates.check,
        },
      ]
    : undefined;

  // Status-bar version/update. The version shows on desktop (web passes none).
  // The chip's label and click follow the updater phase, so it reports progress
  // ("Downloading…") without inviting a click on an action already under way,
  // and offers the right next step ("Restart to update") when there is one.
  const updateState = updates.state;
  const update = (() => {
    const s = updateState;
    if (!s) return { version: null as string | null, label: undefined as string | undefined, onClick: undefined as (() => void) | undefined };
    switch (s.phase) {
      case 'available':
        return { version: s.update.version, label: `Update to v${s.update.version}`, onClick: updates.download };
      case 'postponed':
        return { version: s.update.version, label: `Update to v${s.update.version}`, onClick: updates.check };
      case 'downloading':
        // In progress: report status, no click.
        return { version: s.update.version, label: `Downloading v${s.update.version}\u2026`, onClick: undefined };
      case 'downloaded':
        return { version: s.update.version, label: `Install v${s.update.version}`, onClick: updates.install };
      case 'installing':
        return { version: s.update.version, label: `Installing v${s.update.version}\u2026`, onClick: undefined };
      case 'relaunch-ready':
        return { version: s.update.version, label: 'Restart to update', onClick: updates.relaunch };
      default:
        // idle / checking / up-to-date / failed → no chip (plain version shows).
        return { version: null, label: undefined, onClick: undefined };
    }
  })();

  const handleStationChange = (station: Station) => {
    pickStation(station.id);
    setCurrentPath('/dashboard');
  };

  const handleOnboardingRecheck = async () => {
    try {
      setRechecking(true);
      await qc.invalidateQueries({ queryKey: queryKeys.stations() });
      const list = await qc.fetchQuery(stationsQueryOptions());
      const station = list.find((s) => s.id === selectedStation?.id) || list[0];
      if (station) {
        await Promise.all(
          onboardingProvisionedQueryKeys(station.id).map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
          ),
        );
      }
      // No setStations/setSelectedStation: the refreshed list is already in the
      // query cache that `useStations` reads, and selection derives from it.
    } catch (err) {
      console.error(err);
    } finally {
      setRechecking(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isStationReady =
    selectedStation && selectedStation.onboardingStatus === 'READY_FOR_OPERATIONS';

  /**
   * Chrome-only optimism: while the list is still in flight we do not know the
   * onboarding status, and picking the *reduced* nav would collapse the sidebar
   * and then expand it a round trip later — the shell-pop in its most visible
   * form. The overwhelmingly common case is a returning operator whose station
   * is operational, so draw that and stay still.
   *
   * Guessing wrong costs nothing visually: an unonboarded station routes to a
   * full-page onboarding notice that replaces the shell outright, so there is
   * no half-built sidebar left behind to re-flow.
   */
  const navAssumesReady = isStationReady || stationsLoading;

  // Dynamic Navigation items based on onboarding status
  const navItems = navAssumesReady
    ? [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Shifts', path: '/shifts', roles: ['Owner', 'Manager', 'Accountant', 'Staff'] },
        { label: 'Station Overview', path: '/setup/station', roles: ['Owner', 'Manager'] },
        { label: 'Expenses', path: '/expenses' },
        { label: 'Income', path: '/income' },
        { label: 'Purchases', path: '/purchases', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Inventory', path: '/inventory', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Pricing', path: '/pricing', roles: ['Owner', 'Manager'] },
        { label: 'Accounts', path: '/accounts', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Customers', path: '/customers' },
        { label: 'Reports', path: '/reports', roles: [...REPORTS_ROLES] },
        { label: 'Organization', path: '/organization', roles: ['Owner'] },
      ]
    : [{ label: 'Onboarding Setup', path: '/onboarding', roles: ['Owner', 'Manager'] }];

  const navItemsWithDev = showDeveloperSurfaces
    ? [...navItems, { label: 'Design System', path: '/design-system' }]
    : navItems;

  const renderContent = () => {
    // 1. If not logged in, render the Login screen
    if (!session) {
      return <Login />;
    }

    // 2. If login was successful but user is not mapped in database yet
    if (profileError) {
      const isNetworkError =
        profileError.toLowerCase().includes('failed to fetch') ||
        profileError.toLowerCase().includes('load failed') ||
        profileError.toLowerCase().includes('networkerror') ||
        profileError.toLowerCase().includes('connection refused');

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh',
            backgroundColor: 'var(--bg-canvas)',
            padding: '20px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: 'var(--shadow-1)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
              {isNetworkError ? 'API Server Connection Failed' : 'User Profile Connection Error'}
            </h2>
            <div
              style={{
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                padding: '12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                textAlign: 'left',
                lineHeight: '1.4',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {profileError}
            </div>
            {isNetworkError ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                The frontend app is unable to connect to the backend server at{' '}
                <strong>http://localhost:8787</strong>. Please verify that your API server is
                running (try running <code>npm run dev:api</code>).
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                  Your Supabase Auth account is active, but your profile has not been linked to the
                  public schema database yet. Please provide your administrator with the UID below
                  to map your roles:
                </p>
                <div
                  style={{
                    padding: '10px',
                    backgroundColor: 'var(--bg-surface-alt)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-input)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-strong)',
                    wordBreak: 'break-all',
                  }}
                >
                  {session?.user?.id}
                </div>
              </>
            )}
            <button
              onClick={() => runTask(handleLogout(), 'Could not sign out.')}
              style={{
                height: '32px',
                border: '1px solid var(--border-strong)',
                backgroundColor: 'transparent',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                color: 'var(--text-default)',
              }}
            >
              Sign Out & Try Again
            </button>
          </div>
        </div>
      );
    }

    // 3. Session resolved, station list still arriving. The shell is already
    //    drawn around this, so fill the content area with skeletons rather
    //    than a sentence about internals — and never with a spinner, which
    //    would read as a second, nested wait inside an app that looks ready.
    if (loading || !userRole || stationsLoading) {
      return <SkeletonGrid count={6} />;
    }

    // 4. Gating: station not onboarded yet. Onboarding is web-console only, so
    //    the desktop app shows a "finish on the web" notice (role-aware copy)
    //    and unlocks automatically once the station is READY_FOR_OPERATIONS.
    if (!isStationReady) {
      return (
        <WebOnboardingNotice
          webUrl={webConsoleUrl}
          role={userRole || 'Staff'}
          userName={userName}
          onRecheck={handleOnboardingRecheck}
          onSignOut={handleLogout}
          rechecking={rechecking}
        />
      );
    }

    switch (currentPath) {
      case '/dashboard':
        return (
          <DashboardOverview
            selectedStation={selectedStation}
            userRole={userRole || 'Staff'}
            userName={userName}
            onNavigate={navigate}
          />
        );

      case '/setup/station':
        return (
          <StationOverview
            selectedStation={selectedStation}
            onStationSelected={(station: Station | null) => pickStation(station?.id ?? null)}
          />
        );

      case '/shifts':
        return (
          <ShiftsManagement
            selectedStation={selectedStation}
            userRole={userRole || 'Staff'}
            userName={userName}
            onNavigate={navigate}
          />
        );
      case '/expenses':
        return <ExpensesList selectedStation={selectedStation} userRole={userRole || 'Staff'} />;
      case '/income':
        return <IncomeList selectedStation={selectedStation} userRole={userRole || 'Staff'} />;
      case '/purchases':
        return <PurchasesList selectedStation={selectedStation} />;
      case '/inventory':
        return <InventoryList selectedStation={selectedStation} />;
      case '/pricing':
        return <FuelPricingPanel selectedStation={selectedStation} />;
      case '/accounts':
        return <AccountsPanel selectedStation={selectedStation} />;
      case '/customers':
        return <CustomersList selectedStation={selectedStation} />;
      case '/reports':
        return <ReportsOverview selectedStation={selectedStation} userRole={userRole || 'Staff'} />;
      case '/organization':
        return (
          <OrganizationOverview
            stations={stations}
            selectedStation={selectedStation}
            onStationChange={handleStationChange}
            onNavigate={setCurrentPath}
          />
        );
      case '/design-system':
        return showDeveloperSurfaces ? <DesignSystem /> : <div>Not found</div>;
      default:
        return <div>Not found</div>;
    }
  };

  /**
   * One branded screen for the whole pre-session phase.
   *
   * This replaced two bare text divs — a full-page "Initializing connection to
   * Supabase Auth..." and a "Resolving operational permissions..." — that were
   * styled differently, so moving between them visibly restyled the page. The
   * phases were never worth narrating: the operator cannot act on either.
   *
   * It now covers only the genuine wait before we know who the user is. Once
   * the role lands, the shell is drawn and the station list arrives into it.
   */
  const gate = selectBootGate({
    hasSession: !!session,
    loading,
    userRole,
    profileError: !!profileError,
    stationsLoading,
    stationReady: !!isStationReady,
    // Onboarding is web-console only, so a pre-ready station hands the page to
    // the "finish on the web" notice.
    notReadyTakesOver: true,
  });

  if (gate === 'boot') {
    return <BootScreen />;
  }

  // Login, the profile-error card with its sign-out escape hatch, or the
  // onboarding notice — each owns the viewport, so no shell around it.
  if (gate === 'takeover') {
    return renderContent();
  }

  return (
    <AppShell
      navItems={navItemsWithDev}
      currentPath={currentPath}
      onNavigate={navigate}
      userRole={userRole || 'Staff'}
      userName={userName}
      syncStatus={syncStatus}
      pendingSyncCount={0}
      onLogout={handleLogout}
      stations={stations}
      selectedStation={selectedStation}
      stationsLoading={stationsLoading}
      onStationChange={handleStationChange}
      environmentTag={environmentTag}
      userMenuExtras={updateMenuEntries}
      appVersion={updates.currentVersion}
      updateAvailableVersion={update.version}
      updateLabel={update.label}
      onUpdate={update.onClick}
    >
      {renderContent()}
      <QuickEntryHost selectedStation={selectedStation} />
      <UpdateNotice updates={updates} />
    </AppShell>
  );
};

export default App;
