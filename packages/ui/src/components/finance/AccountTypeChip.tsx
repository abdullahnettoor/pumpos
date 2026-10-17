import React from 'react';
import { Chip } from '../../pump-ds/index.js';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';

export interface AccountTypeChipProps {
  /** `BANK`, `CASH_IN_HAND`, … */
  type: string | null | undefined;
  className?: string;
}

/**
 * A Financial Account's type, read the same everywhere it shows (#530): a
 * neutral chip. A type is a fact about the account, never a state, so it never
 * takes a status tone (amber and red mean a problem).
 */
export const AccountTypeChip: React.FC<AccountTypeChipProps> = ({ type, className }) => (
  <Chip tone="neutral" size="md" className={className}>
    {accountTypeLabel(type)}
  </Chip>
);
