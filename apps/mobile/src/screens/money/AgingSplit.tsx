import React from 'react';
import type { ReceivablesAging } from '@pump/shared';
import { compactRupees } from '../../lib/format.js';
import { agingSegments, type AgingTone } from '../../lib/money/receivables.js';

const FILL: Record<AgingTone, string> = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' };

interface Props {
  aging: ReceivablesAging | null | undefined;
  /** The stacked bar above the figures (the To collect hero); off inside the Customer card, which has its own bar. */
  showBar?: boolean;
  /** A rule above the figures, to sit under another block of the same card. */
  divided?: boolean;
  className?: string;
}

/**
 * How old what is owed is: 0–7, 8–30 and 30+ days, each with its amount and
 * (optionally) a stacked bar. Renders nothing while there is no split to show
 * (nothing owed, or the summary has not loaded): never a row of zeros.
 */
export const AgingSplit: React.FC<Props> = ({
  aging,
  showBar = true,
  divided = false,
  className = '',
}) => {
  const segments = agingSegments(aging);
  if (!segments) return null;
  return (
    <div
      data-testid="aging-split"
      className={`${divided ? 'mt-3 border-t border-line pt-2.5' : 'mt-3'} ${className}`}
    >
      {showBar && (
        <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {segments
            .filter((s) => s.share > 0)
            .map((s) => (
              <div
                key={s.key}
                className={FILL[s.tone]}
                style={{ flex: `${s.share} 1 0%` }}
                data-segment={s.key}
              />
            ))}
        </div>
      )}
      <ul className={`grid grid-cols-3 text-[11px] text-text-muted ${showBar ? 'mt-2' : ''}`}>
        {segments.map((s) => (
          <li key={s.key} data-bucket={s.key}>
            <b
              className={`num block text-[12.5px] font-semibold ${
                s.tone === 'bad' && s.amount > 0 ? 'text-bad-fg' : 'text-text-high'
              }`}
            >
              {compactRupees(s.amount)}
            </b>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
