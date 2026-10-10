import React, { useId } from 'react';
import { inr } from '@pump/ui';
import type { ReceivablesAging } from '@pump/shared';
import { standing, type MoneyCustomer, type StandingState } from '../../lib/money/parties.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { AgingSplit } from './AgingSplit.js';
import { HeroCard } from './HeroCard.js';
import { LimitBar } from './LimitBar.js';

/** The credit-limit edit affordance; absent when this user may not change the limit. */
export interface LimitAction {
  onPress: () => void;
  /** Set while the action is paused (Restricted Access): why, shown under the button. */
  disabledReason?: string;
}

/** The quiet "Record payment" button; absent when this user may not record one. */
export interface PaymentAction {
  onPress: () => void;
  /** Set while the action is paused (Suspension): why, shown under the button. */
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
 * When the receivables summary is there, the aging split (0–7 / 8–30 / 30+ days)
 * sits under the limit bar; without it (loading, failed, no Station) the card is
 * just the balance and the limit.
 */
export const BalanceCard: React.FC<{
  customer: MoneyCustomer;
  aging?: ReceivablesAging | null;
  limitAction?: LimitAction;
  paymentAction?: PaymentAction;
}> = ({ customer, aging, limitAction, paymentAction }) => {
  const s = standing(customer);
  const amount = s.state === 'advance' ? -s.balance : s.balance;
  const hasLimit = s.limit !== null;
  const owes = s.state === 'over' || s.state === 'near' || s.state === 'under';
  const reasonId = useId();
  const paymentReasonId = useId();
  const paused = Boolean(limitAction?.disabledReason);
  const paymentPaused = Boolean(paymentAction?.disabledReason);

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
      {owes && <AgingSplit aging={aging} showBar={false} divided />}
      {(paymentAction || limitAction) && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2">
          <div className="flex items-center justify-between gap-2">
            {/* Quiet on purpose: an outline, not the accent fill. The action bar stays Share / Download.
                aria-disabled, not disabled: the button stays focusable, so a screen reader
                reaches it and hears the reason it is paused. */}
            {paymentAction && (
              <button
                type="button"
                onClick={paymentPaused ? undefined : paymentAction.onPress}
                aria-disabled={paymentPaused || undefined}
                aria-describedby={paymentPaused ? paymentReasonId : undefined}
                className="min-h-[36px] rounded-lg border border-line-strong px-3 text-[12.5px] font-bold text-text-high aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                Record payment
              </button>
            )}
            {limitAction && (
              <button
                type="button"
                onClick={paused ? undefined : limitAction.onPress}
                aria-disabled={paused || undefined}
                aria-describedby={paused ? reasonId : undefined}
                className="ml-auto min-h-[36px] rounded-lg px-2 text-[12.5px] font-bold text-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                {hasLimit ? 'Edit limit' : 'Set limit'}
              </button>
            )}
          </div>
          {paymentAction?.disabledReason && (
            <p id={paymentReasonId} className="m-0 text-[11px] text-text-muted">
              {paymentAction.disabledReason}
            </p>
          )}
          {limitAction?.disabledReason && (
            <p id={reasonId} className="m-0 text-[11px] text-text-muted">
              {limitAction.disabledReason}
            </p>
          )}
        </div>
      )}
    </HeroCard>
  );
};
