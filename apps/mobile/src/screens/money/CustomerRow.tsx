import React from 'react';
import { inr } from '@pump/ui';
import { compactRupees } from '../../lib/format.js';
import { limitOf, standing, type MoneyCustomer, type Standing } from '../../lib/money/parties.js';
import { oldestCaption } from '../../lib/money/receivables.js';
import { Avatar } from '../../ui/Avatar.js';
import { ChevronRightIcon } from '../../ui/icons.js';
import { BalanceFigure } from './BalanceFigure.js';
import { LimitBar } from './LimitBar.js';

/** "Fleet · limit ₹2L", or just the type when no limit is set. */
const metaOf = (c: MoneyCustomer): string => {
  const limit = limitOf(c);
  return [c.customerType, limit ? `limit ${compactRupees(limit)}` : null]
    .filter(Boolean)
    .join(' · ');
};

/** What a screen reader hears for the whole row: "KTC, ₹2,14,600.00 owed, over limit". */
const spokenLabel = (name: string, s: Standing, oldest: string | null): string => {
  const money =
    s.state === 'advance'
      ? `${inr(-s.balance)} advance`
      : s.state === 'settled'
        ? 'settled'
        : `${inr(s.balance)} owed`;
  const limit = s.state === 'over' ? 'over limit' : s.state === 'near' ? 'near limit' : null;
  return [name, money, limit, oldest?.toLowerCase()].filter(Boolean).join(', ');
};

/** One To collect row: avatar, name, type and limit, balance (red over the limit), how long the oldest debt has waited, and the limit bar. */
export const CustomerRow: React.FC<{
  customer: MoneyCustomer;
  onPress: () => void;
  /** Days the customer's oldest unpaid debt has waited (receivables summary); null/absent = not known. */
  oldestUnpaidDays?: number | null;
}> = ({ customer, onPress, oldestUnpaidDays }) => {
  const s = standing(customer);
  const caption =
    s.state === 'advance' || s.state === 'settled' ? null : oldestCaption(oldestUnpaidDays);
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={spokenLabel(customer.name, s, caption?.text ?? null)}
      className="flex w-full flex-col gap-2 px-3 py-[11px]"
    >
      <span className="flex w-full items-center gap-2.5">
        <Avatar name={customer.name} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-semibold text-text-high">
            {customer.name}
          </span>
          <span className="block truncate text-[11px] text-text-muted">{metaOf(customer)}</span>
        </span>
        <BalanceFigure balance={s.balance} over={s.state === 'over'} caption={caption} />
        <span className="flex-shrink-0 text-text-faint">
          <ChevronRightIcon size={16} strokeWidth={2.2} />
        </span>
      </span>
      {s.usedPct !== null && s.tone && (
        <LimitBar decorative usedPct={s.usedPct} tone={s.tone} className="ml-[44px] mr-[26px]" />
      )}
    </button>
  );
};
