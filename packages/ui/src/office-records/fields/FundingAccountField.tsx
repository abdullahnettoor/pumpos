import React, { useEffect, useMemo } from 'react';
import type { FundingAccountType } from '../../services/cloud.js';
import { useFundingAccounts } from '../../query/hooks.js';
import {
  OFFICE_ACCOUNT_TYPES,
  filterFundingAccounts,
  reconcileFundingSelection,
} from '../../utils/fundingAccounts.js';
import { accountTypeDetail } from '../../utils/ledgerLabels.js';
import { AccountTypeChip } from '../../components/finance/AccountTypeChip.js';
import { formatMoney } from '../../utils/format.js';
import { Field } from '../../components/primitives/Field.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { useOfficeRecordContext } from '../context.js';

export interface FundingAccountFieldProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** "Money goes out of" / "Money comes into". */
  hint: string;
  /** Account types to offer (stable module constants). */
  types?: readonly FundingAccountType[];
  error?: string;
  label?: string;
}

/**
 * The Funding Account of an Office Record (glossary): a radio list of the
 * station's accounts with their balance when the role may see balances. There
 * is no "auto": the operator picks. One matching account is preselected, and a
 * choice the method no longer allows is cleared.
 */
export const FundingAccountField: React.FC<FundingAccountFieldProps> = ({
  name,
  value,
  onChange,
  hint,
  types = OFFICE_ACCOUNT_TYPES,
  error,
  label = 'Funding account',
}) => {
  const { stationId, balances, disabled } = useOfficeRecordContext();
  const { data, isSuccess } = useFundingAccounts(stationId);
  const accounts = useMemo(() => filterFundingAccounts(data ?? [], types), [data, types]);

  useEffect(() => {
    if (!isSuccess) return;
    const next = reconcileFundingSelection(value, accounts);
    if (next !== value) onChange(next);
  }, [isSuccess, accounts, value, onChange]);

  return (
    <Field label={label} required error={error}>
      <span className="field-hint -mt-1 mb-1.5 block">{hint}</span>
      {isSuccess && accounts.length === 0 ? (
        <span className="text-[12px] text-warning-fg">
          No matching accounts. Add one in Accounts.
        </span>
      ) : (
        <div
          role="radiogroup"
          aria-label={label}
          className={cn(
            'flex flex-col overflow-hidden rounded-input border',
            error ? 'border-danger-fg' : 'border-border-soft',
          )}
        >
          {accounts.map((a) => {
            const on = a.id === value;
            const balance = balances.get(a.id);
            return (
              <label
                key={a.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 border-b border-border-soft px-3 py-2 text-[13px] last:border-b-0',
                  on ? 'bg-brand/10 text-ink-strong' : 'text-ink-default hover:bg-surface-alt',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={a.id}
                  checked={on}
                  disabled={disabled}
                  onChange={() => onChange(a.id)}
                  className="accent-brand"
                />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {accountTypeDetail(a.name, a.accountType) && (
                  <AccountTypeChip type={a.accountType} />
                )}
                {balance != null && (
                  <span className="w-28 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                    {formatMoney(balance, { decimals: 0 })}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </Field>
  );
};
