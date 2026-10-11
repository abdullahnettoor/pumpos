// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * App wiring: the Account sheet's Sign out must still run the same sign-out as
 * before the shell revamp, whose session handler purges the persisted cache.
 */
const who = vi.hoisted(() => ({ role: 'Owner', assignment: null as unknown }));
let onSession: (session: unknown) => Promise<void>;
const clearClientSessionData = vi.fn();
const supabaseSignOut = vi.fn(async () => {
  await onSession(null);
});
const ASSIGNED = {
  shift: { id: 's1', templateName: 'Shift 2' },
  dispenserUnits: [{ duId: 'du-2', duName: 'DU2', nozzles: [], terminals: [] }],
};
const stations = [{ id: 'st-1', name: 'Highway Fuels', settings: {} }];

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BootScreen: () => <p>booting</p>,
    Login: () => <p>login screen</p>,
    CloudStationService: class {
      getCurrentSession = async () => ({
        user: { role: who.role, fullName: 'Abdullah N', email: 'a@b.c' },
      });
    },
    startSession: (handle: (s: unknown) => Promise<void>) => {
      onSession = handle;
      void handle({ access_token: 't', user: { id: 'u1' } });
      return { stop: () => {} };
    },
    installSupabaseTokenSource: () => {},
    setApiBaseUrl: () => {},
    setAuthToken: () => {},
    clearClientSessionData: (...a: unknown[]) => clearClientSessionData(...a),
    supabase: { auth: { signOut: () => supabaseSignOut() } },
    useStations: () => ({ data: stations, isLoading: false }),
    useMyAssignment: () => ({ data: who.assignment }),
    useUsers: () => ({ data: [], isLoading: false }),
    useShiftStatus: () => ({ data: null }),
    useOrganization: () => ({ data: { name: 'Org' } }),
    useAccess: () => ({ data: undefined }),
  };
});
vi.mock('./lib/alerts.js', () => ({ useMobileAlerts: () => [] }));
vi.mock('./shell/TabRoot.js', async () => {
  const { HomeHeader } = await import('./shell/HomeHeader.js');
  return {
    TabRoot: () => (
      <>
        <HomeHeader />
        <p>tab root</p>
      </>
    ),
  };
});

const { App } = await import('./App.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { ThemeProvider } = await import('./theme/index.js');

beforeEach(() => {
  who.role = 'Owner';
  who.assignment = null;
  clearClientSessionData.mockClear();
  supabaseSignOut.mockClear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const renderApp = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
const dockLabels = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));

describe('App Role routing', () => {
  it('Staff with no Dispenser Unit see the limited-access screen, no dock', async () => {
    who.role = 'Staff';
    renderApp();
    await screen.findByText('Mobile access is limited');
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('Staff assigned to a Dispenser Unit get a dock with only Home, for the handover card', async () => {
    who.role = 'Staff';
    who.assignment = ASSIGNED;
    renderApp();
    await screen.findByText('tab root');
    expect(dockLabels()).toEqual(['Home']);
  });

  it('a Manager assigned to a Dispenser Unit gets the same dock as an Owner, and no My handover tab', async () => {
    who.role = 'Manager';
    who.assignment = ASSIGNED;
    renderApp();
    await screen.findByText('tab root');
    expect(dockLabels()).toEqual(['Home', 'Shifts', 'Reports', 'Money', 'Insights']);
  });

  it('an Owner assigned to a Dispenser Unit gets the same dock as any Owner', async () => {
    who.assignment = ASSIGNED;
    renderApp();
    await screen.findByText('tab root');
    expect(dockLabels()).toEqual(['Home', 'Shifts', 'Reports', 'Money', 'Insights']);
  });

  it('a Manager with no assignment gets the same dock as an Owner, Home included', async () => {
    who.role = 'Manager';
    renderApp();
    await screen.findByText('tab root');
    expect(dockLabels()).toEqual(['Home', 'Shifts', 'Reports', 'Money', 'Insights']);
  });

  it('an assignment holding no Dispenser Unit does not count', async () => {
    who.role = 'Staff';
    who.assignment = { shift: { id: 's1' }, dispenserUnits: [] };
    renderApp();
    await screen.findByText('Mobile access is limited');
  });
});

describe('App', () => {
  it('Sign out in the Account sheet signs out and clears the persisted cache', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
          <App />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('tab root');
    clearClientSessionData.mockClear(); // the initial sign-in resolve does not purge

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const dialog = screen.getByRole('dialog', { name: 'Account' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    });

    await waitFor(() => expect(supabaseSignOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clearClientSessionData).toHaveBeenCalledTimes(1));
    await screen.findByText('login screen');
  });
});
