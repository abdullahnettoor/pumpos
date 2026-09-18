/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { canOnboardStation, type Role } from '@pump/shared';
import { ToastProvider } from '../primitives/ToastProvider.js';
import { WebOnboardingNotice } from './WebOnboardingNotice.js';

afterEach(cleanup);

const ALL_ROLES: Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];

// The notice reports copy-to-clipboard failures through a toast, so it needs
// the provider mounted even though this suite never triggers one.
const renderFor = (role: Role) =>
  render(
    <ToastProvider>
      <WebOnboardingNotice
        webUrl="https://console.pumpos.app"
        role={role}
        userName="Asha Menon"
        onRecheck={() => {}}
        onSignOut={() => {}}
      />
    </ToastProvider>,
  );

/**
 * Who may onboard a station is one rule, owned by the shared guard. This suite
 * exists to fail when a call site stops agreeing with it — three hand-written
 * copies of `Owner || Manager` are what let a role quietly go missing before
 * (#132, #135), so the assertion is driven by the guard rather than by a second
 * list written here.
 */
describe('WebOnboardingNotice follows the shared onboarding guard', () => {
  it.each(ALL_ROLES)('offers %s the console link only if the guard allows it', (role) => {
    renderFor(role);

    const offered = screen.queryByRole('button', { name: /open web console/i }) !== null;

    expect(offered).toBe(canOnboardStation(role));
  });

  it.each(ALL_ROLES)('tells %s whose job the setup is, matching the guard', (role) => {
    renderFor(role);

    const invited = screen.queryByText(/finish setting up on the web/i) !== null;

    expect(invited).toBe(canOnboardStation(role));
  });

  it('always leaves a sign-out, whichever side of the guard the role falls', () => {
    for (const role of ALL_ROLES) {
      renderFor(role);
      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeNull();
      cleanup();
    }
  });
});
