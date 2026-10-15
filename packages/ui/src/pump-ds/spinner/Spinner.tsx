import React from 'react';
import { cn } from '../lib/cn.js';

export interface SpinnerProps {
  /** Size and colour classes, e.g. `size-6 text-brand`. Defaults to `size-4`, current colour. */
  className?: string;
}

/**
 * Spinner: the one spinning glyph (Button's busy state, the boot screen). It
 * spins only when motion is allowed (`motion-safe:`); under reduced motion it
 * holds still and the copy beside it carries the message. Decorative: pair it
 * with text or an `aria-busy` owner.
 */
export const Spinner: React.FC<SpinnerProps> = ({ className }) => (
  <svg
    className={cn('size-4 motion-safe:animate-spin', className)}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
