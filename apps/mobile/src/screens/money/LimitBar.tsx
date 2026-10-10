import React from 'react';
import type { LimitTone } from '../../lib/money/parties.js';
import { TONE_FILL } from '../../ui/tones.js';

interface Props {
  /** Balance as a percent of the credit limit (may pass 100). */
  usedPct: number;
  /** From `standing()`: the same decision as the Near / Over limit badge. */
  tone: LimitTone;
  /**
   * Hide the bar from assistive tech: inside a row button whose label already
   * says it all (a progressbar nested in a button is not exposed reliably).
   */
  decorative?: boolean;
  className?: string;
}

/** Credit-limit usage: accent under 80%, amber at 80–100%, red over 100%. Fills to at most 100%. */
export const LimitBar: React.FC<Props> = ({
  usedPct,
  tone,
  decorative = false,
  className = '',
}) => {
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({
        role: 'progressbar',
        'aria-label': 'Credit limit used',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.min(100, usedPct),
        'aria-valuetext': `${usedPct}% of credit limit`,
      } as const);
  return (
    <div
      {...a11y}
      data-tone={tone}
      className={`h-1.5 overflow-hidden rounded-full bg-track ${className}`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
      />
    </div>
  );
};
