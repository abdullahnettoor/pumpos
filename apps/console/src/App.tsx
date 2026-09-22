import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppShell,
  BootScreen,
  StationOnboardingLockout,
  SkeletonGrid,
  Login,
  AcceptInvite,
  OnboardingWizard,
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
  useRunTask,
  publishNavIntent,
  clearNavIntent,
} from '@pump/ui';
import type { NavIntent } from '@pump/ui';
import { canOnboardStation, REPORTS_ROLES, Station } from '@pump/shared';
import { MobileBlock, useIsUnsupportedMobile } from './MobileBlock.js';

const resolveApiUrl = (): string | undefined => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'console.pumpos.app') return 'https://api.pumpos.app';
    if (hostname === 'console.pumpos.abdullahnettoor.com')
      return 'https://api.pumpos.abdullahnettoor.com';
    if (hostname === 'dev-pumpos-console.abdullahnettoor.workers.dev')
      return 'https://pumpos-api.abdullahnettoor.workers.dev';
  }
  return undefined;
};

setApiBaseUrl(resolveApiUrl());

// Requests resolve the live session token per call rather than a stale snapshot.
installSupabaseTokenSource();

const stationService = new CloudStationService();

const environmentTag = (() => {
  const explicitEnv = (import.meta.env.VITE_APP_ENV as string | undefined)?.toLowerCase();
  if (explicitEnv === 'preview') return 'Preview';
  if (explicitEnv === 'dev' || explicitEnv === 'development') return 'Dev';
  if (import.meta.env.DEV) return 'Dev';

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Dev domain or localhost
    if (hostname === 'localhost') return 'Local';
    if (hostname === 'console.pumpos.abdullahnettoor.com') return 'Preview';
    if (hostname === 'dev-pumpos-console.abdullahnettoor.workers.dev') return 'Dev';
    // Cloudflare preview env deploys as <worker-name>-preview.<subdomain>.workers.dev
    if (hostname.includes('-preview.')) return 'Preview';
  }
  return null;
})();

// Local development only: the Design System reference tab is never shown in
// deployed (dev/preview/prod) builds.
const isLocalDev = (() => {
  if (import.meta.env.DEV) return true;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
  }
  return false;
})();

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard');
  // A deep-link intent (e.g. open a customer's statement from global search)
  // travels through the nav-intent store rather than as a prop, so the
  // destination can derive from it instead of reacting to it in an effect.
  const navigate = useCallback((path: string, intent?: NavIntent) => {
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

  // Supabase Auth and Backend user context states
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<'Owner' | 'Manager' | 'Accountant' | 'Staff' | null>(
    null,
  );
  const [userName, setUserName] = useState<string>('');
  const [profileError, setProfileError] = useState<{
    message: string;
    code?: string;
    status?: number;
  } | null>(null);
  const { stations, selectedStation, pickStation, stationsLoading } = useSelectedStation(!!session);

  const lastUserIdRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);
  const qc = useQueryClient();
  const runTask = useRunTask();
  const isUnsupportedMobile = useIsUnsupportedMobile();

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
        setProfileError({
          message: err?.message || 'Verification failed. Profile not found.',
          code: err?.code,
          status: err?.status,
        });
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

  // handleSession is re-created on every render (it closes over most of this
  // component's state), so the subscription reads it through a ref rather than
  // depending on it. Depending on it would tear down and re-establish the auth
  // listener — and re-read the stored session — on every single render.
  const handleSessionRef = useRef(handleSession);
  useEffect(() => {
    handleSessionRef.current = handleSession;
  });

  useEffect(() => {
    // Reads the stored session, then keeps listening. A failed read falls back
    // to the signed-out path rather than leaving the operator on a spinner —
    // see startSession in @pump/ui, which is covered by its own tests.
    const { stop } = startSession((session) => handleSessionRef.current(session));
    return stop;
  }, []);

  const handleStationChange = (station: Station) => {
    // A pending deep link points at the previous station's entities.
    clearNavIntent();
    pickStation(station.id);
    // Dashboard is home for both ready and pre-ready stations (the dashboard
    // shows a getting-started hero until the station is operational).
    setCurrentPath('/dashboard');
  };

  const handleOnboardingComplete = async (completedStation: Station) => {
    try {
      await Promise.all(
        onboardingProvisionedQueryKeys(completedStation.id).map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
      // Refreshed list lands in the query cache that `useStations` reads;
      // selection derives from it, so only the explicit pick is set here.
      await qc.fetchQuery(stationsQueryOptions());
      pickStation(completedStation.id);
    } catch (err) {
      console.error(err);
    }
    setCurrentPath('/dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isStationReady =
    selectedStation && selectedStation.onboardingStatus === 'READY_FOR_OPERATIONS';

  /**
   * Chrome-only optimism: while the list is in flight the onboarding status is
   * unknown, and choosing the reduced nav would collapse the sidebar and expand
   * it a round trip later. Draw the common case (an operational station) and
   * stay still; a pre-ready station swaps the content area, not the chrome.
   */
  const navAssumesReady = isStationReady || stationsLoading;

  // Dynamic Navigation items based on onboarding status
  /**
   * Where the sidebar should show the operator as standing.
   *
   * A pre-ready station falls back to the Dashboard for any operational
   * destination (branch 5 below), so a deep link to /shifts would otherwise
   * highlight Shifts while the Dashboard is on screen. Derived rather than
   * pushed through setCurrentPath: this used to be forced once the awaited
   * station list came back, and re-adding it as an effect would set state
   * during render and cascade.
   */
  const effectivePath =
    !stationsLoading &&
    !isStationReady &&
    currentPath !== '/onboarding' &&
    currentPath !== '/organization'
      ? '/dashboard'
      : currentPath;

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
    : [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Organization', path: '/organization', roles: ['Owner', 'Manager'] },
      ];

  const navItemsWithDev = isLocalDev
    ? [...navItems, { label: 'Design System', path: '/design-system' }]
    : navItems;

  const renderContent = () => {
    // 1. If not logged in, render the Login screen
    if (!session) {
      return <Login />;
    }

    // 2. If login was successful but user is not mapped in database yet
    if (profileError) {
      const msg = profileError.message.toLowerCase();
      const isNetworkError =
        profileError.code === 'NETWORK' ||
        msg.includes('network error') ||
        msg.includes('failed to fetch') ||
        msg.includes('load failed') ||
        msg.includes('networkerror') ||
        msg.includes('connection refused') ||
        msg.includes('econnrefused') ||
        msg.includes('err_connection_refused');
      const isProfileMissing =
        !isNetworkError &&
        (profileError.code === 'FORBIDDEN' ||
          profileError.status === 403 ||
          msg.includes('profile inactive') ||
          msg.includes('profile not found'));

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
              {isNetworkError
                ? 'API Server Connection Failed'
                : isProfileMissing
                  ? 'User Profile Connection Error'
                  : 'Sign-in Failed'}
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
              {profileError.message}
            </div>
            {isNetworkError ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                The frontend app is unable to connect to the backend API at{' '}
                <strong>{import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}</strong>. Please
                verify the API server is reachable.
              </p>
            ) : isProfileMissing ? (
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
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                Something went wrong while verifying your session. Try signing out and back in.
              </p>
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
    //    drawn around this, so fill the content area with skeletons rather than
    //    a sentence about internals — and never with a spinner, which would
    //    read as a second, nested wait inside an app that already looks ready.
    if (loading || !userRole || stationsLoading) {
      return <SkeletonGrid count={6} />;
    }

    // 4. Gating: the roles that cannot finish setup themselves. "Locked out"
    //    is precisely "cannot onboard", so it reads from the same guard the
    //    quick-create does rather than keeping a second role list here that
    //    could drift from it. (Attendant is not in this app's role union, so
    //    it was never a live hole here — the guard simply covers it.)
    //    The screen carries its own sign-out because it does not always render
    //    inside the shell: /onboarding renders bare, and a Staff user who got
    //    there had no way out but a page reload (#132).
    if (!stationsLoading && !isStationReady && userRole && !canOnboardStation(userRole)) {
      return (
        <StationOnboardingLockout
          // Layout only — the sign-out is unconditional, so getting this
          // wrong costs padding, never the way out.
          inShell={currentPath !== '/onboarding'}
          onSignOut={() => runTask(handleLogout(), 'Could not sign out.')}
        />
      );
    }

    // 5. Pre-ready: Dashboard is home (it renders a getting-started hero until a
    // station is READY). The Organization hub and the onboarding wizard are also
    // reachable; any other (operational) destination falls back to the Dashboard.
    if (
      !stationsLoading &&
      !isStationReady &&
      currentPath !== '/onboarding' &&
      currentPath !== '/organization' &&
      currentPath !== '/dashboard'
    ) {
      return (
        <DashboardOverview
          selectedStation={selectedStation}
          userRole={userRole || 'Staff'}
          userName={userName}
          onNavigate={navigate}
        />
      );
    }

    switch (currentPath) {
      case '/onboarding':
        return (
          <OnboardingWizard
            onOnboardingComplete={handleOnboardingComplete}
            onExit={() => navigate('/dashboard')}
            userName={userName}
          />
        );
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
        return isLocalDev ? <DesignSystem /> : <div>Not found</div>;
      default:
        return <div>Not found</div>;
    }
  };

  // Invite / set-password landing. Handled before any device or session gate so
  // an owner can open the emailed invite on a phone and set their password. The
  // client parses the token from the URL; on completion we return to `/` where
  // the normal session bootstrap routes them (Organization hub / desktop notice
  // when no station is ready yet).
  const isAcceptInvite =
    typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '') === '/accept-invite';
  if (isAcceptInvite) {
    return <AcceptInvite onDone={() => window.location.assign('/')} />;
  }

  // Unsupported-device gate (fallback to the edge Worker redirect).
  if (isUnsupportedMobile) {
    return <MobileBlock />;
  }
  /**
   * One branded screen for the whole pre-session phase.
   *
   * This replaced two bare text divs — a full-page "Initializing connection to
   * Supabase Auth..." and a "Resolving operational permissions..." — that were
   * styled differently, so moving between them visibly restyled the page. The
   * phases were never worth narrating: the operator cannot act on either.
   *
   * It now covers only the genuine wait before we know who the user is; once
   * the role lands, the shell is drawn and stations arrive into it.
   */
  const gate = selectBootGate({
    hasSession: !!session,
    loading,
    userRole,
    profileError: !!profileError,
    stationsLoading,
    stationReady: !!isStationReady,
    // This is where onboarding happens, so a pre-ready station stays in the
    // shell: the dashboard shows a getting-started hero and the wizard is
    // reachable, with operational affordances hidden via `stationReady`.
    notReadyTakesOver: false,
  });

  if (gate === 'boot') {
    return <BootScreen />;
  }

  // Login, an error card, or the focused wizard → bare. Otherwise the full
  // shell — the pre-ready Organization hub lives inside it.
  // The focused onboarding wizard is its own takeover on top of the shared gate.
  if (gate === 'takeover' || currentPath === '/onboarding') {
    return renderContent();
  }

  return (
    <AppShell
      navItems={navItemsWithDev}
      currentPath={effectivePath}
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
      stationReady={!!isStationReady}
    >
      {renderContent()}
      <QuickEntryHost selectedStation={selectedStation} />
    </AppShell>
  );
};

export default App;
