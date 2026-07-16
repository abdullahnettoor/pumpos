import React from 'react';
import { useFinancialAccounts } from '../../query/hooks.js';
import { Combobox } from './Combobox.js';
import { inr } from '../../utils/format.js';

type AccountType = 'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'OWNER';

const TYPE_LABEL: Record<AccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  OWNER: 'Owner',
};

export interface AccountSelectProps {
  stationId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Account types to offer. Defaults to pay-from/collect-into accounts. */
  types?: AccountType[];
  disabled?: boolean;
  autoLabel?: string;
}

/**
 * Picks a money account to post a transaction against (cash-in-hand / petty cash
 * / a specific bank / owner). The default "Auto" ('') lets the backend resolve by
 * payment method / paid-from. Filters to active accounts of the allowed types.
 */
export const AccountSelect: React.FC<AccountSelectProps> = ({ stationId, value, onChange, types, disabled, autoLabel = 'Auto (by default)' }) => {
  const { data: accounts } = useFinancialAccounts(stationId);
  const allowed = types ?? (['CASH_IN_HAND', 'PETTY_CASH', 'BANK', 'OWNER'] as AccountType[]);
  const opts = (accounts || [])
    .filter((a: any) => allowed.includes(a.accountType) && a.isActive !== false)
    .map((a: any) => ({ value: a.id, label: a.name, sublabel: `${TYPE_LABEL[a.accountType as AccountType] ?? a.accountType} · ${inr(a.balance)}` }));
  const options = [{ value: '', label: autoLabel }, ...opts];
  return (
    <Combobox
      options={options}
      value={value || ''}
      onChange={onChange}
      placeholder={autoLabel}
      searchPlaceholder="Search accounts…"
      disabled={disabled}
    />
  );
};
