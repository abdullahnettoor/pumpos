import React from 'react';
import { Button } from '../../pump-ds/button/index.js';
import { cn } from '../../pump-ds/lib/cn.js';

export interface StationOnboardingLockoutProps {
  onSignOut: () => void | Promise<unknown>;
  /**
   * Rendered inside the app shell rather than standing alone. Only affects
   * layout — the sign-out stays either way, see below.
   */
  inShell?: boolean;
  className?: string;
}

/**
 * Shown to the roles that cannot finish station setup themselves.
 *
 * They are told to wait, which makes this a screen with nothing to do on it —
 * so it has to offer a way off. The console can render it as a focused full
 * page, outside the shell whose top bar would otherwise carry the sign-out, and
 * a Staff user who landed there had no navigation, no sign-out, and no
 * browser history to go back through: only a page reload (#132).
 *
 * The sign-out is kept even when the shell is present and already provides one.
 * The duplication is deliberate and cheap; the alternative is a screen whose
 * safety depends on where it happens to be mounted, which is the assumption
 * that failed last time.
 */
export const StationOnboardingLockout: React.FC<StationOnboardingLockoutProps> = ({
  onSignOut,
  inShell = false,
  className = '',
}) => {
  return (
    <div
      className={cn(
        'animate-fade-in flex flex-col items-center justify-center gap-4 px-6 text-center',
        inShell ? 'py-16' : 'min-h-[100dvh] bg-canvas',
        className,
      )}
    >
      <div className="flex max-w-[460px] flex-col items-center gap-2">
        <h2 className="text-[15px] font-semibold text-ink-strong">Station setup in progress</h2>
        <p className="text-[13px] text-ink-muted">
          An Owner or Manager is still finishing this station&rsquo;s setup. Your access unlocks
          automatically once they&rsquo;re done — there&rsquo;s nothing you need to do.
        </p>
      </div>
      {/* Calls straight through rather than wrapping in runTask: callers
          already do that, and reaching for it here would make a screen whose
          whole job is to be a safe exit depend on a toast provider being
          mounted above it. */}
      <Button variant="secondary" size="sm" onClick={() => void onSignOut()}>
        Sign out
      </Button>
    </div>
  );
};
