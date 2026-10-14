import React from 'react';
import { Field } from '../../components/primitives/Field.js';
import { Combobox } from '../../components/primitives/Combobox.js';
import { Icon } from '../../pump-ds/index.js';
import { inr } from '../../utils/format.js';
import { useOfficeRecordContext } from '../context.js';

export interface PartyOption {
  id: string;
  name: string;
  /** A customer's due, or what is owed to a supplier. */
  balance?: number | null;
}

export interface PartyFieldProps {
  party: 'customer' | 'supplier';
  options: readonly PartyOption[];
  value: string;
  onChange: (id: string) => void;
  /** Opened from a statement: the party is fixed and shown as a locked card. */
  locked?: PartyOption | null;
  error?: string;
}

const balanceText = (party: PartyFieldProps['party'], balance?: number | null) =>
  balance == null ? undefined : `${inr(balance)} ${party === 'customer' ? 'due' : 'owed'}`;

/** The customer of a collection or the supplier of a purchase / payment. */
export const PartyField: React.FC<PartyFieldProps> = ({
  party,
  options,
  value,
  onChange,
  locked,
  error,
}) => {
  const { disabled } = useOfficeRecordContext();
  const label = party === 'customer' ? 'Customer' : 'Supplier';

  if (locked) {
    return (
      <div
        className="mb-4 flex items-center gap-2.5 rounded-input border border-border-soft bg-surface-alt px-3 py-2.5 text-[13px]"
        aria-label={label}
      >
        <span className="text-ink-muted">
          <Icon name={party === 'customer' ? 'users' : 'truck'} size="sm" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-ink-strong">{locked.name}</span>
          {locked.balance != null && (
            <span className="text-[11.5px] text-ink-muted">
              {balanceText(party, locked.balance)}
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-faint">
          <Icon name="lock" size="xs" />
          From statement
        </span>
      </div>
    );
  }

  return (
    <Field label={label} required error={error}>
      <Combobox
        options={options.map((o) => ({
          value: o.id,
          label: o.name,
          sublabel: o.balance ? balanceText(party, o.balance) : undefined,
        }))}
        value={value}
        onChange={onChange}
        placeholder={party === 'customer' ? 'Choose a customer' : 'Choose a supplier'}
        searchPlaceholder={party === 'customer' ? 'Search customers…' : 'Search suppliers…'}
        emptyMessage={party === 'customer' ? 'No customers found.' : 'No suppliers found.'}
        invalid={!!error}
        disabled={disabled}
      />
    </Field>
  );
};
