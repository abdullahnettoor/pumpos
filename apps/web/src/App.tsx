import React, { useState, useEffect } from 'react';
import { 
  AppShell, 
  StatusBadge, 
  Login, 
  OnboardingWizard, 
  StationOverview, 
  CloudStationService, 
  setAuthToken, 
  supabase 
} from '@pump/ui';
import { Station } from '@pump/shared';

const stationService = new CloudStationService();

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard');
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'synced' | 'pending' | 'failed'>('synced');
  
  // Track globally active/selected station for setup context
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabase Auth and Backend user context states
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<'Owner' | 'Manager' | 'Accountant' | 'Staff' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [profileError, setProfileError] = useState<string | null>(null);

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
    setSession(currentSession);
    setProfileError(null);

    if (currentSession) {
      // Pass the JWT token to our request headers wrapper
      setAuthToken(currentSession.access_token);
      setSelectedStation(null);
      setStations([]);
      
      try {
        setLoading(true);
        // Fetch session context from our backend (verifies JWT, gets user role & name)
        const sessionData = await stationService.getCurrentSession();
        setUserRole(sessionData.user.role);
        setUserName(sessionData.user.fullName || sessionData.user.email);

        // Fetch station setup status
        const list = await stationService.getStations();
        setStations(list);
        if (list.length > 0) {
          const active = list[0];
          setSelectedStation(active);
          if (active.onboardingStatus !== 'READY_FOR_OPERATIONS') {
            setCurrentPath('/onboarding');
          } else {
            setCurrentPath('/dashboard');
          }
        } else {
          // No stations configured yet
          setCurrentPath('/onboarding');
        }
      } catch (err: any) {
        console.error('Failed to resolve backend profile:', err);
        setProfileError(err.message || 'Verification failed. Profile not found.');
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    } else {
      // Clear token and states
      setAuthToken('');
      setStations([]);
      setSelectedStation(null);
      setUserRole(null);
      setUserName('');
      setLoading(false);
      setCurrentPath('/login');
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
      const list = await stationService.getStations();
      setStations(list);
    } catch (err) {
      console.error(err);
    }
    setSelectedStation(completedStation);
    setCurrentPath('/dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isStationReady = selectedStation && selectedStation.onboardingStatus === 'READY_FOR_OPERATIONS';

  // Dynamic Navigation items based on onboarding status
  const navItems = isStationReady
    ? [
        { label: 'Dashboard', path: '/dashboard', icon: '📊' },
        { label: 'Shifts', path: '/shifts', icon: '⛽', roles: ['Owner', 'Manager', 'Staff'] },
        { label: 'Station Overview', path: '/setup/station', icon: '⚙️', roles: ['Owner', 'Manager'] },
        { label: 'Expenses', path: '/expenses', icon: '💸' },
        { label: 'Purchases', path: '/purchases', icon: '🛒', roles: ['Owner', 'Manager', 'Accountant'] },
        { label: 'Customers', path: '/customers', icon: '👥' },
        { label: 'Reports', path: '/reports', icon: '📈', roles: ['Owner', 'Manager', 'Accountant'] },
      ]
    : [
        { label: 'Onboarding Setup', path: '/onboarding', icon: '⚙️', roles: ['Owner', 'Manager'] }
      ];

  const renderContent = () => {
    // 1. If not logged in, render the Login screen
    if (!session) {
      return <Login />;
    }

    // 2. If login was successful but user is not mapped in database yet
    if (profileError) {
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
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>User Profile Connection Error</h2>
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
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>Welcome to PumpERP</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Your offline-first operational control center.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '8px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-soft)' }}>
                <h3 style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Shift Status</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Morning Shift #0294</span>
                  <StatusBadge status="OPEN" type="success" />
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-soft)' }}>
                <h3 style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Daily Sales</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>₹ 1,48,250</span>
                  <span style={{ color: 'var(--state-success-fg)', fontSize: '11px', fontWeight: 600 }}>+12% vs yesterday</span>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-card)', border: '1px solid var(--border-soft)' }}>
                <h3 style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sync Queue</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>All Events Synced</span>
                  <button 
                    onClick={() => {
                      setSyncStatus('pending');
                      setTimeout(() => setSyncStatus('synced'), 1500);
                    }}
                    style={{
                      height: '24px',
                      padding: '0 8px',
                      fontSize: '11px',
                      backgroundColor: 'var(--brand-primary)',
                      border: 'none',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Sync Now
                  </button>
                </div>
              </div>
            </div>
          </div>
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
          <div className="animate-fade-in">
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Shifts Management</h1>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>Manage shift templates and active operations.</p>
          </div>
        );
      case '/expenses':
        return (
          <div className="animate-fade-in">
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Expenses Tracker</h1>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>Log and reconcile daily operational expenses.</p>
          </div>
        );
      case '/purchases':
        return (
          <div className="animate-fade-in">
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Supplier Purchases</h1>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>Record product inventory purchases and payments.</p>
          </div>
        );
      case '/customers':
        return (
          <div className="animate-fade-in">
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Customer Accounts</h1>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>Track fleet balances and credit limits.</p>
          </div>
        );
      case '/reports':
        return (
          <div className="animate-fade-in">
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>DSSR & Reports</h1>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>Operational reports, DSSR, and client exports.</p>
          </div>
        );
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
      navItems={navItems}
      currentPath={currentPath}
      onNavigate={setCurrentPath}
      userRole={userRole || 'Staff'}
      userName={userName}
      syncStatus={syncStatus}
      pendingSyncCount={syncStatus === 'pending' ? 3 : 0}
      onLogout={handleLogout}
      stations={stations}
      selectedStation={selectedStation}
      onStationChange={handleStationChange}
    >
      {renderContent()}
    </AppShell>
  );
};

export default App;
