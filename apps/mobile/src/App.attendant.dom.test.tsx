// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * An Attendant signed in lands in the Attendant app and nowhere else: the
 * owner/manager shell (tabs, station picker, business-day pill) never mounts,
 * and the roles' extra "My handover" assignment lookup is not made for them.
 */
const useMyAssignment = vi.fn((_options?: { enabled?: boolean }) => ({
  data: null,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: () => Promise.resolve(),
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BootScreen: () => <p>boot</p>,
    Login: () => <p>login</p>,
    useStations: () => ({ data: [{ id: 's1', name: 'Highway Fuels' }], isLoading: false }),
    useMyAssignment: (options?: { enabled?: boolean }) => useMyAssignment(options),
    useMerchandiseHandovers: () => ({ data: [] }),
    runTask: (p: Promise<unknown>) => p.catch(() => {}),
  };
});

vi.mock('./lib/session.js', () => ({
  useSession: () => ({ status: 'ready', role: 'Attendant', userName: 'Sajid P', error: null }),
  signOut: () => Promise.resolve(),
}));

const { App } = await import('./App.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

describe('App as an Attendant', () => {
  afterEach(cleanup);

  it('renders only the Attendant app, with no shell navigation', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Sajid P · Attendant')).toBeDefined();
    expect(screen.getByText('No shift assigned')).toBeDefined();
    expect(screen.queryByRole('navigation')).toBeNull();
    // The shared "My handover tab" lookup is for other roles; the Attendant app reads its own.
    expect(useMyAssignment).toHaveBeenCalledWith({ enabled: false });
  });
});
