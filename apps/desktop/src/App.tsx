import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  AppShell, 
  Login, 
  OnboardingWizard, 
  StationOverview, 
  DashboardOverview,
  OrganizationOverview,
  ShiftsManagement,
  ExpensesList,
  PurchasesList,
  CustomersList,
  InventoryList,
  ReportsOverview,
  FuelPricingPanel,
  AccountsPanel,
  DesignSystem,
  QuickEntryHost,
  CloudStationService, 
  queryKeys,
  setApiBaseUrl,
  setAuthToken, 
  clearPersistedQueryCache,
  clearStoredOnboardingDraft,
  supabase 
} from '@pump/ui';
import { Station } from '@pump/shared';

setApiBaseUrl(import.meta.env.VITE_API_URL);

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
    if (hostname === 'dev-pumpos.abdullahnettoor.workers.dev') return 'Dev';
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

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard');
  const [navIntent, setNavIntent] = useState<import('@pump/ui').NavIntent | null>(null);
  const navigate = useCallback((path: string, intent?: import('@pump/ui').NavIntent) => {
    setCurrentPath(path);
    setNavIntent(intent ?? null);
  }, []);
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'synced' | 'pending' | 'failed'>(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  );

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

  // Track globally active/selected station for setup context
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabase Auth and Backend user context states
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<'Owner' | 'Manager' | 'Accountant' | 'Staff' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const resolvedRef = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    // 1. Check current active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // 2. Subscribe to auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
        qc.clear();
        clearPersistedQueryCache();
        clearStoredOnboardingDraft();
      }

      lastUserIdRef.current = currentSession.user.id;
      setSelectedStation(null);
      setStations([]);
      
      try {
        setLoading(true);
        // Fetch session context from our backend (verifies JWT, gets user role & name)
        const sessionData = await stationService.getCurrentSession();
        setUserRole(sessionData.user.role);
        resolvedRef.current = true;
        setUserName(sessionData.user.fullName?.trim() || sessionData.user.email);

        // Stations rarely change — serve from the shared cache (+ localStorage) on
        // repeat session resolves instead of re-hitting /setup/stations every time.
        const list = await qc.fetchQuery({
          queryKey: queryKeys.stations(),
          queryFn: () => stationService.getStations(),
          staleTime: 24 * 60 * 60_000,
        });
        setStations(list);
        if (list.length > 0) {
          const active = list.find((station) => station.onboardingStatus === 'READY_FOR_OPERATIONS') || list[0];
          setSelectedStation(active);
          if (active.onboardingStatus !== 'READY_FOR_OPERATIONS') {
            setCurrentPath('/onboarding');
          } else {
            // Only direct to dashboard if currently on onboarding or login
            setCurrentPath((prev) => (prev === '/onboarding' || prev === '/login') ? '/dashboard' : prev);
          }
        } else {
          // No stations configured yet
          setCurrentPath('/onboarding');
        }
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
      setStations([]);
      setSelectedStation(null);
      setUserRole(null);
      setUserName('');
      setLoading(false);
      setCurrentPath('/login');
      // Wipe all cached + persisted data so the next user starts from a clean
      // slate (prevents cross-user data bleed and stale "station not found").
      qc.clear();
      clearPersistedQueryCache();
      clearStoredOnboardingDraft();
    }
  };

  const handleStationChange = (station: Station) => {
    setSelectedStation(station);
    if (station.onboardingStatus !== 'READY_FOR_OPERATIONS') {
      setCurrentPath('/onboarding');
    } else {
      setCurrentPath('/dashboard');
    }
  };

  const handleOnboardingComplete = async (completedStation: Station) => {
    try {
      await qc.invalidateQueries({ queryKey: queryKeys.stations() });
      const list = await stationService.getStations();
      qc.setQueryData(queryKeys.stations(), list);
      setStations(list);
      setSelectedStation(list.find((station) => station.id === completedStation.id) || completedStation);
    } catch (err) {
      console.error(err);
    }
    setCurrentPath('/dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isStationReady = selectedStation && selectedStation.onboardingStatus === 'READY_FOR_OPERATIONS';

  // Dynamic Navigation items based on onboarding status
  const navItems = isStationReady
    ? [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Shifts', path: '/shifts', roles: ['Owner', 'Manager', 'Staff'] },
        { label: 'Station Overview', path: '/setup/station', roles: ['Owner', 'Manager'] },
        { label: 'Expenses', path: '/expenses' },
        { label: 'Purchases', path: '/purchases', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Inventory', path: '/inventory', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Pricing', path: '/pricing', roles: ['Owner', 'Manager'] },
        { label: 'Accounts', path: '/accounts', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Customers', path: '/customers' },
        { label: 'Reports', path: '/reports', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Organization', path: '/organization', roles: ['Owner'] },
      ]
    : [
        { label: 'Onboarding Setup', path: '/onboarding', roles: ['Owner', 'Manager'] }
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
      const isNetworkError =
        profileError.toLowerCase().includes('failed to fetch') ||
        profileError.toLowerCase().includes('load failed') ||
        profileError.toLowerCase().includes('networkerror') ||
        profileError.toLowerCase().includes('connection refused');

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '80vh',
          backgroundColor: 'var(--bg-canvas)',
          padding: '20px',
          fontFamily: 'var(--font-sans)'
        }}>
          <div style={{
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
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
              {isNetworkError ? 'API Server Connection Failed' : 'User Profile Connection Error'}
            </h2>
            <div style={{ 
              backgroundColor: 'var(--state-danger-bg)', 
              color: 'var(--state-danger-fg)', 
              padding: '12px', 
              borderRadius: 'var(--radius-input)', 
              fontSize: '12px',
              textAlign: 'left',
              lineHeight: '1.4',
              fontFamily: 'var(--font-mono)'
            }}>
              {profileError}
            </div>
            {isNetworkError ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                The frontend app is unable to connect to the backend server at <strong>http://localhost:8787</strong>. Please verify that your API server is running (try running <code>npm run dev:api</code>).
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5' }}>
                  Your Supabase Auth account is active, but your profile has not been linked to the public schema database yet. Please provide your administrator with the UID below to map your roles:
                </p>
                <div style={{
                  padding: '10px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-input)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-strong)',
                  wordBreak: 'break-all'
                }}>
                  {session?.user?.id}
                </div>
              </>
            )}
            <button
              onClick={handleLogout}
              style={{
                height: '32px',
                border: '1px solid var(--border-strong)',
                backgroundColor: 'transparent',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                color: 'var(--text-default)'
              }}
            >
              Sign Out & Try Again
            </button>
          </div>
        </div>
      );
    }

    // 3. Loading user context / roles
    if (loading || !userRole) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)'
        }}>
          Resolving operational permissions...
        </div>
      );
    }

    // 4. Gating check: Block operators/staff if station setup is not completed
    if (!isStationReady && ((userRole as string) === 'Staff' || (userRole as string) === 'Accountant')) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
          padding: '24px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-card)',
          maxWidth: '500px',
          margin: '40px auto'
        }} className="animate-fade-in">
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Station Onboarding In Progress</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
            The fuel station configuration is currently being finalized by the Owner or Manager. Operations will be unlocked automatically once complete.
          </p>
        </div>
      );
    }

    // 5. Gating check: Force Owner/Manager into the Onboarding Wizard
    if (!isStationReady && currentPath !== '/onboarding') {
      return (
        <OnboardingWizard
          onOnboardingComplete={handleOnboardingComplete}
          userName={userName}
        />
      );
    }

    switch (currentPath) {
      case '/onboarding':
        return (
          <OnboardingWizard
            onOnboardingComplete={handleOnboardingComplete}
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
            onStationSelected={setSelectedStation}
          />
        );

      case '/shifts':
        return (
          <ShiftsManagement
            selectedStation={selectedStation}
            userRole={userRole || 'Staff'}
            userName={userName}
            onNavigate={setCurrentPath}
          />
        );
      case '/expenses':
        return (
          <ExpensesList
            selectedStation={selectedStation}
            userRole={userRole || 'Staff'}
            intent={navIntent}
            onIntentConsumed={() => setNavIntent(null)}
          />
        );
      case '/purchases':
        return (
          <PurchasesList
            selectedStation={selectedStation}
            intent={navIntent}
            onIntentConsumed={() => setNavIntent(null)}
          />
        );
      case '/inventory':
        return (
          <InventoryList
            selectedStation={selectedStation}
            intent={navIntent}
            onIntentConsumed={() => setNavIntent(null)}
          />
        );
      case '/pricing':
        return <FuelPricingPanel selectedStation={selectedStation} />;
      case '/accounts':
        return <AccountsPanel selectedStation={selectedStation} />;
      case '/customers':
        return (
          <CustomersList
            selectedStation={selectedStation}
            intent={navIntent}
            onIntentConsumed={() => setNavIntent(null)}
          />
        );
      case '/reports':
        return (
          <ReportsOverview
            selectedStation={selectedStation}
            userRole={userRole || 'Staff'}
          />
        );
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

  // Outer loading spinner before session checks resolve
  if (loading && !session) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)'
      }}>
        Initializing connection to Supabase Auth...
      </div>
    );
  }

  // If not logged in, or if station is not ready (onboarding mode)
  if (!session || !isStationReady) {
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
      onStationChange={handleStationChange}
      environmentTag={environmentTag}
    >
      {renderContent()}
      <QuickEntryHost selectedStation={selectedStation} />
    </AppShell>
  );
};

export default App;
