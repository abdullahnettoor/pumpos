import React from 'react';
import { limitTone, type LimitTone } from '../../lib/money/parties.js';

const FILL: Record<LimitTone, string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

interface Props {
  /** Balance as a percent of the credit limit (may pass 100). */
  usedPct: number;
  className?: string;
}

/** Credit-limit usage: accent under 80%, amber at 80–100%, red over 100%. Fills to at most 100%. */
export const LimitBar: React.FC<Props> = ({ usedPct, className = '' }) => {
  const tone = limitTone(usedPct);
  return (
    <div
      role="progressbar"
      aria-label="Credit limit used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, usedPct)}
      aria-valuetext={`${usedPct}% of credit limit`}
      data-tone={tone}
      className={`h-1.5 overflow-hidden rounded-full bg-track ${className}`}
    >
      <div
        className={`h-full rounded-full ${FILL[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
      />
    </div>
  );
};
