import React from 'react';
import { inr } from '@pump/ui';
import { balanceState } from '../../lib/money/parties.js';
import type { OldestCaption } from '../../lib/money/receivables.js';
import { TONE_TEXT } from '../../ui/tones.js';

interface Props {
  balance: number;
  /** Colours the figure red: the Customer is over their credit limit. */
  over?: boolean;
  /** "Oldest 18 days" under an amount that is owed (To collect). Hidden when the age is unknown. */
  caption?: OldestCaption | null;
}

/**
 * A party's balance in a list row: the amount (an advance in green, without its
 * minus sign) and, for an advance or a settled party, a caption saying so.
 * Shared by the To collect and To pay rows so both read the same.
 */
export const BalanceFigure: React.FC<Props> = ({ balance, over = false, caption }) => {
  const kind = balanceState(balance);
  const tone = over ? 'text-bad-fg' : kind === 'advance' ? 'text-good' : 'text-text-high';
  return (
    <span className="block flex-shrink-0 text-right">
      <span className={`num block text-[13.5px] font-semibold ${tone}`}>
        {kind === 'advance' ? inr(-balance) : inr(kind === 'settled' ? 0 : balance)}
      </span>
      {kind === 'owes' && caption && (
        <span
          className={`block text-[11px] font-normal ${TONE_TEXT[caption.tone]}`}
          data-tone={caption.tone}
        >
          {caption.text}
        </span>
      )}
      {kind !== 'owes' && (
        <span className="block text-[11px] font-normal text-text-muted">
          {kind === 'advance' ? 'Advance' : 'Settled'}
        </span>
      )}
    </span>
  );
};
