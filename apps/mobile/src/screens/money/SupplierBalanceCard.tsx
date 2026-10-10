import React, { useId } from 'react';
import { inr } from '@pump/ui';
import { balanceOf, balanceState, type MoneySupplier } from '../../lib/money/parties.js';
import { SURFACE } from './BalanceCard.js';
import { HeroCard } from './HeroCard.js';
import { PaymentReason, RecordPaymentButton, type PaymentAction } from './RecordPaymentButton.js';

const LABEL = { owes: 'You owe', advance: 'Advance', settled: 'Settled' } as const;

const NOTE = {
  owes: null,
  advance: 'Paid ahead; it clears against your next purchases.',
  settled: 'Nothing due.',
} as const;

/**
 * What you owe a Supplier (Σ purchases − Σ payments): You owe, Advance (a
 * negative balance: you have paid ahead) or Settled. Same surfaces as the
 * Customer card; no limit and no due dates (payment terms are not in the data).
 * The quiet "Record payment" outline button (a Supplier Payment) sits in its
 * footer when this user may record one; the action bar stays Share / Download.
 *
 * Seam for #399 (payables summary): oldest unpaid, purchased vs paid this month
 * and purchases by product go under this card.
 */
export const SupplierBalanceCard: React.FC<{
  supplier: MoneySupplier;
  paymentAction?: PaymentAction;
}> = ({ supplier, paymentAction }) => {
  const reasonId = useId();
  const balance = balanceOf(supplier);
  const state = balanceState(balance);
  const amount = state === 'advance' ? -balance : state === 'settled' ? 0 : balance;
  return (
    <HeroCard
      ariaLabel="Balance"
      state={state}
      surface={SURFACE[state === 'owes' ? 'under' : state]}
      label={LABEL[state]}
      value={inr(amount)}
    >
      {NOTE[state] && <p className="mt-1 text-[11.5px] text-text-muted">{NOTE[state]}</p>}
      {paymentAction && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2">
          <div className="flex items-center justify-between gap-2">
            <RecordPaymentButton action={paymentAction} reasonId={reasonId} />
          </div>
          <PaymentReason action={paymentAction} reasonId={reasonId} />
        </div>
      )}
    </HeroCard>
  );
};
