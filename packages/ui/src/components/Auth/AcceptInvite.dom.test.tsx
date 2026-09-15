// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitForElementToBeRemoved } from '@testing-library/react';

const getSession = vi.fn();
const unsubscribe = vi.fn();

// The component imports the Supabase singleton directly, so the seam is the
// module. No network is reached from these tests.
vi.mock('../../services/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }),
      updateUser: vi.fn(),
    },
  },
}));

const { AcceptInvite } = await import('./AcceptInvite.js');

const SPINNER = 'Verifying your invite…';

describe('AcceptInvite bootstrap', () => {
  let consoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSession.mockReset();
    unsubscribe.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}) as ReturnType<
      typeof vi.fn
    >;
  });
  afterEach(() => {
    // Vitest runs without globals, so RTL's automatic cleanup never registers.
    cleanup();
    consoleError.mockRestore();
  });

  // The regression. A rejected getSession used to skip setReady(true), leaving
  // the recipient on "Verifying your invite…" forever with nothing to click.
  it('leaves the loading state and offers a way forward when the session read rejects', async () => {
    getSession.mockRejectedValue(new Error('network down'));

    render(<AcceptInvite />);
    expect(screen.getByText(SPINNER)).toBeDefined();

    await waitForElementToBeRemoved(() => screen.queryByText(SPINNER));

    // Interactive, and honest about what went wrong.
    expect(screen.getByText(/invite link is invalid or has expired/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('shows the password form when the invite session resolves', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { email: 'attendant@example.com' } } },
    });

    render(<AcceptInvite />);
    await waitForElementToBeRemoved(() => screen.queryByText(SPINNER));

    expect(screen.getByText('attendant@example.com')).toBeDefined();
    expect(screen.queryByText(/invite link is invalid or has expired/i)).toBeNull();
  });

  it('treats a resolved-but-empty session as an unusable invite', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    render(<AcceptInvite />);
    await waitForElementToBeRemoved(() => screen.queryByText(SPINNER));

    expect(screen.getByText(/invite link is invalid or has expired/i)).toBeDefined();
  });

  it('unsubscribes from auth changes on unmount', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = render(<AcceptInvite />);
    await waitForElementToBeRemoved(() => screen.queryByText(SPINNER));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
