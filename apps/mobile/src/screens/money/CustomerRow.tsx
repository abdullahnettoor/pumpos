import React from 'react';
import { inr } from '@pump/ui';
import { compactRupees } from '../../lib/money/format.js';
import { limitOf, standing, type MoneyCustomer } from '../../lib/money/parties.js';
import { Avatar } from '../../ui/Avatar.js';
import { ChevronRightIcon } from '../../ui/icons.js';
import { LimitBar } from './LimitBar.js';

/** "Fleet · limit ₹2L", or just the type when no limit is set. */
const metaOf = (c: MoneyCustomer): string => {
  const limit = limitOf(c);
  return [c.customerType, limit ? `limit ${compactRupees(limit)}` : null]
    .filter(Boolean)
    .join(' · ');
};

/** One To collect row: avatar, name, type and limit, balance (red over the limit) and the limit bar. */
export const CustomerRow: React.FC<{ customer: MoneyCustomer; onPress: () => void }> = ({
  customer,
  onPress,
}) => {
  const s = standing(customer);
  const owed = s.state !== 'advance' && s.state !== 'settled';
  return (
    <button type="button" onClick={onPress} className="flex w-full flex-col gap-2 px-3 py-[11px]">
      <span className="flex w-full items-center gap-2.5">
        <Avatar name={customer.name} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-semibold text-text-high">
            {customer.name}
          </span>
          <span className="block truncate text-[11px] text-text-muted">{metaOf(customer)}</span>
        </span>
        <span className="flex-shrink-0 text-right">
          <span
            className={`num block text-[13.5px] font-semibold ${
              s.state === 'over'
                ? 'text-bad-fg'
                : s.state === 'advance'
                  ? 'text-good'
                  : 'text-text-high'
            }`}
          >
            {s.state === 'advance' ? inr(-s.balance) : inr(s.balance)}
          </span>
          {!owed && (
            <span className="block text-[11px] text-text-muted">
              {s.state === 'advance' ? 'Advance' : 'Settled'}
            </span>
          )}
        </span>
        <span className="flex-shrink-0 text-text-faint">
          <ChevronRightIcon size={16} strokeWidth={2.2} />
        </span>
      </span>
      {s.usedPct !== null && owed && (
        <LimitBar usedPct={s.usedPct} className="ml-[44px] mr-[26px]" />
      )}
    </button>
  );
};
