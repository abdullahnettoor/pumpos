import { canOnboardStation, type Role } from '@pump/shared';
import { describe, expect, it } from 'vitest';
import { preReadyQuickCreateIds } from './quickCreateActions.js';

describe('preReadyQuickCreateIds', () => {
  it('offers onboarding to the roles that can actually run the wizard', () => {
    expect(preReadyQuickCreateIds('Owner')).toContain('onboard-station');
    expect(preReadyQuickCreateIds('Manager')).toContain('onboard-station');
  });

  it('withholds it from the roles the wizard would refuse', () => {
    // This is the whole bug (#132). Offering it routed Staff and Accountants
    // to a focused full page that then refused them — rendered outside the
    // shell, so without the top bar's sign-out, and with no way back.
    expect(preReadyQuickCreateIds('Staff')).not.toContain('onboard-station');
    expect(preReadyQuickCreateIds('Accountant')).not.toContain('onboard-station');
  });

  it('still gives the refused roles something, rather than an empty menu', () => {
    // An empty list hides the "+ New" button entirely. Inviting the team is a
    // safe destination — it renders inside the shell, which keeps its sign-out
    // — so there is no reason to strip the menu down to nothing.
    expect(preReadyQuickCreateIds('Staff')).toEqual(['team-member']);
  });

  it('keeps onboarding first for the roles that have it', () => {
    // It is the one thing that actually moves a pre-ready station forward, so
    // it should not sit below the secondary action.
    expect(preReadyQuickCreateIds('Owner')[0]).toBe('onboard-station');
  });
});

describe('the lockout and the quick-create agree on who is locked out', () => {
  it('treats "cannot onboard" as one rule, so no role falls between them', () => {
    // The console decides whether to show the lockout with the same guard this
    // list uses. When they were separate, the console listed Staff and
    // Accountant by hand and missed Attendant, who fell through into a wizard
    // that would refuse them.
    const allRoles: Role[] = ['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant'];

    for (const role of allRoles) {
      expect(preReadyQuickCreateIds(role).includes('onboard-station')).toBe(
        canOnboardStation(role),
      );
    }
  });
});
