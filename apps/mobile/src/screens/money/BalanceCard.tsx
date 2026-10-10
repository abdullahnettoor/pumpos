import React, { useId } from 'react';
import { inr } from '@pump/ui';
import { standing, type MoneyCustomer, type StandingState } from '../../lib/money/parties.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { HeroCard } from './HeroCard.js';
import { LimitBar } from './LimitBar.js';

/** The credit-limit edit affordance; absent when this user may not change the limit. */
export interface LimitAction {
  onPress: () => void;
  /** Set while the action is paused (Restricted Access): why, shown under the button. */
  disabledReason?: string;
}

export const SURFACE: Record<StandingState, string> = {
  over: 'border-bad-line bg-bad-soft',
  near: 'border-warn-line bg-warn-soft',
  under: 'border-hero-line bg-[image:var(--hero)]',
  advance: 'border-good-line bg-good-soft',
  settled: 'border-hero-line bg-[image:var(--hero)]',
};

const LABEL: Record<StandingState, string> = {
  over: 'Owes you',
  near: 'Owes you',
  under: 'Owes you',
  advance: 'Advance',
  settled: 'Settled',
};

/**
 * The Customer's balance and where it stands against the credit limit: Owes you
 * (under / near / over the limit), Advance, or Settled.
 *
 * Seam for #398: the aging split (0–7 / 8–30 / 30+ days) and the tiles for last
 * payment, usually pays in and vehicle spend belong with this card once the
 * receivables-summary data exists. They are not derivable from the ledger, so
 * they are not shown.
 */
export const BalanceCard: React.FC<{ customer: MoneyCustomer; limitAction?: LimitAction }> = ({
  customer,
  limitAction,
}) => {
  const s = standing(customer);
  const amount = s.state === 'advance' ? -s.balance : s.balance;
  const hasLimit = s.limit !== null;
  const owes = s.state === 'over' || s.state === 'near' || s.state === 'under';
  const reasonId = useId();
  const paused = Boolean(limitAction?.disabledReason);

  return (
    <HeroCard
      ariaLabel="Balance"
      state={s.state}
      surface={SURFACE[s.state]}
      label={LABEL[s.state]}
      value={inr(amount)}
      badge={
        s.state === 'over' ? (
          <StatusBadge tone="bad">Over limit</StatusBadge>
        ) : s.state === 'near' ? (
          <StatusBadge tone="warn">Near limit</StatusBadge>
        ) : undefined
      }
    >
      {s.state === 'settled' && <p className="mt-1 text-[11.5px] text-text-muted">Nothing due.</p>}
      {s.state === 'advance' && (
        <p className="mt-1 text-[11.5px] text-text-muted">
          Paid ahead; it clears against credit sales.
        </p>
      )}

      {owes && hasLimit && s.usedPct !== null && s.tone && (
        <div className="mt-3">
          <LimitBar usedPct={s.usedPct} tone={s.tone} className="!h-2" />
          <div className="mt-1.5 flex justify-between text-[11.5px] text-text-muted">
            <span className="num">Limit {inr(s.limit)}</span>
            {s.state === 'over' ? (
              <span className="num font-semibold text-bad-fg">
                +{inr(s.overBy)} over · {s.usedPct}%
              </span>
            ) : (
              <span className="num">
                {inr(s.room)} left · {s.usedPct}% used
              </span>
            )}
          </div>
        </div>
      )}
      {owes && !hasLimit && (
        <p className="mt-3 text-[11.5px] text-text-muted">No credit limit set.</p>
      )}
      {limitAction && (
        <div className="mt-2.5 flex flex-col items-end gap-1 border-t border-line pt-2">
          {/* aria-disabled, not disabled: it stays focusable, so a screen reader reaches
              the button and hears the reason it is paused. */}
          <button
            type="button"
            onClick={paused ? undefined : limitAction.onPress}
            aria-disabled={paused || undefined}
            aria-describedby={paused ? reasonId : undefined}
            className="min-h-[36px] rounded-lg px-2 text-[12.5px] font-bold text-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {hasLimit ? 'Edit limit' : 'Set limit'}
          </button>
          {limitAction.disabledReason && (
            <p id={reasonId} className="m-0 text-[11px] text-text-muted">
              {limitAction.disabledReason}
            </p>
          )}
        </div>
      )}
    </HeroCard>
  );
};
