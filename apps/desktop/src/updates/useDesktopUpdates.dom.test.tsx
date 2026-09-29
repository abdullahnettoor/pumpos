/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { UpdateHandle, UpdaterAdapter } from './types.js';

const check = vi.fn(async (): Promise<UpdateHandle | null> => null);

vi.mock('./environment.js', () => ({
  detectTauri: () => true,
  shouldEnableUpdates: () => true,
}));
vi.mock('./tauriAdapter.js', () => ({
  createTauriUpdaterAdapter: async (): Promise<UpdaterAdapter> => ({
    currentVersion: '1.0.0',
    platform: 'macos',
    check,
    relaunch: async () => {},
  }),
  createDefaultRestartReadiness: () => ({ check: async () => ({ safe: true }) }),
}));

const { useDesktopUpdates } = await import('./useDesktopUpdates.js');
const { UpdateNotice } = await import('./UpdateNotice.js');

afterEach(() => {
  cleanup();
  check.mockReset();
});

/** Stands in for a signed-out screen: no session, just the hook and the notice. */
function SignedOutScreen() {
  const updates = useDesktopUpdates();
  return (
    <>
      <p>Sign in</p>
      <UpdateNotice updates={updates} />
    </>
  );
}

describe('useDesktopUpdates at app start (#328)', () => {
  it('checks once without a session and offers the update on the sign-in screen', async () => {
    check.mockResolvedValue({
      version: '1.1.0',
      notes: 'Fixes.',
      download: async () => {},
      install: async () => {},
    });
    render(<SignedOutScreen />);
    await screen.findByText('PumpOS 1.1.0 is available');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the automatic check finds no update (#327)', async () => {
    check.mockResolvedValue(null);
    render(<SignedOutScreen />);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
