import React, { useState } from 'react';
import { SegmentedControl } from '../../pump-ds/index.js';
import { UnifiedLedger } from './UnifiedLedger.js';
import { CashBankLedger } from './CashBankLedger.js';

type LedgerView = 'party' | 'cash-bank';

const VIEWS = [
  { value: 'party', label: 'Party' },
  { value: 'cash-bank', label: 'Cash & bank' },
] as const;

/**
 * Reports → Ledgers (#540): the party ledger and the period cash & bank view
 * under one entry. Live balances and per-account ledgers stay in Accounts.
 */
export const LedgersReport: React.FC<{ selectedStation: any | null }> = ({ selectedStation }) => {
  const [view, setView] = useState<LedgerView>('party');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SegmentedControl aria-label="Ledger view" options={VIEWS} value={view} onChange={setView} />
      {view === 'party' && <UnifiedLedger selectedStation={selectedStation} />}
      {view === 'cash-bank' && <CashBankLedger selectedStation={selectedStation} />}
    </div>
  );
};
