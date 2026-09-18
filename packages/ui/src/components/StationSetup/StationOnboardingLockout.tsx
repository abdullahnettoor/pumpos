import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../../pump-ds/button/index.js';
import { EmptyState } from '../../pump-ds/empty-state/index.js';
import { cn } from '../../pump-ds/lib/cn.js';

/**
 * What this state says, in one place. The dashboard renders the same state in
 * its own panel, and when each owned its wording they had already drifted to
 * different descriptions of an identical situation.
 */
export const STATION_SETUP_IN_PROGRESS = {
  title: 'Station setup in progress',
  description:
    "An Owner or Manager is still finishing this station's setup. Your access unlocks automatically once they're done — there's nothing you need to do.",
} as const;

export interface StationOnboardingLockoutProps {
  onSignOut: () => void | Promise<unknown>;
  /**
   * Rendered inside the app shell rather than standing alone. Layout only —
   * the sign-out is unconditional either way, see below.
   */
  inShell?: boolean;
}

/**
 * Shown to the roles that cannot finish station setup themselves.
 *
 * They are told to wait, which makes this a screen with nothing to do on it —
 * so it has to offer a way off. The console can render it as a focused full
 * page, outside the shell whose top bar would otherwise carry the sign-out, and
 * a Staff user who landed there had no navigation, no sign-out and no browser
 * history to go back through: only a page reload (#132).
 *
 * The sign-out is required, not optional, and stays even when the shell is
 * present and already provides one. The duplication is cheap; the alternative
 * is a screen whose safety depends on where it happens to be mounted, which is
 * exactly the assumption that failed here.
 */
export const StationOnboardingLockout: React.FC<StationOnboardingLockoutProps> = ({
  onSignOut,
  inShell = false,
}) => (
  <div
    className={cn(
      'animate-fade-in flex flex-col justify-center',
      inShell ? '' : 'min-h-[100dvh] bg-canvas',
    )}
  >
    <EmptyState
      icon={<TriangleAlert />}
      title={STATION_SETUP_IN_PROGRESS.title}
      description={STATION_SETUP_IN_PROGRESS.description}
      action={
        // Calls straight through rather than wrapping in runTask: callers
        // already do that, and reaching for it here would make a screen whose
        // whole job is to be a safe exit depend on a toast provider being
        // mounted above it.
        <Button variant="secondary" size="sm" onClick={() => void onSignOut()}>
          Sign out
        </Button>
      }
    />
  </div>
);
