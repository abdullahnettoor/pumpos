import React from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { PumpOSMark } from '../brand/index.js';
import { cn } from '../lib/cn.js';

export interface BootScreenProps {
  /**
   * What the app is doing, in the operator's language. Defaults to the
   * sign-in phase because that is the only wait long enough to be worth
   * naming — see the note on phases below.
   */
  message?: string;
  className?: string;
}

/**
 * The single screen between pressing Sign In and seeing the app.
 *
 * It replaces four: a full-page "Initializing connection to Supabase Auth...",
 * a "Resolving operational permissions...", mobile's "Connecting…", and the
 * flicker between them. Those were three differently-styled bare text divs, so
 * moving between boot phases visibly restyled the page — and two of them named
 * internals an operator has no model for. "Resolving operational permissions"
 * in particular reads like it is about to deny them entry.
 *
 * Deliberately *one* screen for the whole pre-session phase. The phases are an
 * implementation detail; narrating them buys the operator nothing and costs a
 * flash each time. Callers may override `message` where a genuinely different
 * wait is in progress, but should not use it to narrate internal steps.
 */
export const BootScreen: React.FC<BootScreenProps> = ({
  message = 'Signing you in…',
  className = '',
}) => (
  <div
    className={cn(
      'flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-canvas',
      'animate-fade-in',
      className,
    )}
  >
    <PumpOSMark
      className="h-12 w-auto text-brand"
      // Decorative: the copy below already says what is happening, so
      // announcing the logo as well would just be noise.
      aria-hidden="true"
    />
    {/* Polite, not assertive: this is progress, not something that should
        interrupt whatever a screen reader is already saying. */}
    <div role="status" aria-live="polite">
      <LoadingSpinner text={message} />
    </div>
  </div>
);
