import React, { useEffect, useMemo } from 'react';
import { useFundingAccounts } from '../../query/hooks.js';
import type { FundingAccountType } from '../../services/cloud.js';
import {
  OFFICE_ACCOUNT_TYPES,
  filterFundingAccounts,
  reconcileFundingSelection,
} from '../../utils/fundingAccounts.js';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';
import { Combobox } from './Combobox.js';

export interface FundingAccountSelectProps {
  stationId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Account types to offer. Defaults to cash / petty cash / bank / owner. */
  types?: readonly FundingAccountType[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * Picks the Funding Account an Office Record is paid from / received into.
 * There is no "auto": the user picks. When exactly one account matches it is
 * preselected, and a choice the current filter no longer allows is cleared.
 */
export const FundingAccountSelect: React.FC<FundingAccountSelectProps> = ({
  stationId,
  value,
  onChange,
  types = OFFICE_ACCOUNT_TYPES,
  disabled,
  invalid,
  id,
}) => {
  const { data, isSuccess } = useFundingAccounts(stationId);
  // `types` must be referentially stable: callers pass module-level constants
  // (OFFICE_ACCOUNT_TYPES, collectionAccountTypes(), …).
  const accounts = useMemo(() => filterFundingAccounts(data ?? [], types), [data, types]);

  useEffect(() => {
    if (!isSuccess) return;
    const next = reconcileFundingSelection(value, accounts);
    if (next !== value) onChange(next);
  }, [isSuccess, accounts, value, onChange]);

  return (
    <Combobox
      id={id}
      options={accounts.map((a) => ({
        value: a.id,
        label: a.name,
        sublabel: accountTypeLabel(a.accountType),
      }))}
      value={value || ''}
      onChange={onChange}
      placeholder="Choose account…"
      searchPlaceholder="Search accounts…"
      emptyMessage="No matching accounts. Add one in Finance → Accounts."
      disabled={disabled}
      invalid={invalid}
    />
  );
};
