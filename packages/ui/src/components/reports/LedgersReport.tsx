import React, { useState } from 'react';
import { SegmentedControl } from '../../pump-ds/index.js';
import type { NavIntent } from '../../nav-intent/store.js';
import { UnifiedLedger } from './UnifiedLedger.js';
import { CashBankReport } from './cash-bank/CashBankReport.js';

type LedgerView = 'party' | 'cash-bank';

const VIEWS = [
  { value: 'party', label: 'Party' },
  { value: 'cash-bank', label: 'Cash & bank' },
] as const;

/**
 * Reports → Ledgers (#540): the party ledger and the cash & bank summary under
 * one entry. Live balances and per-account statements stay in Accounts; a
 * cash & bank row opens its account's statement there (#531).
 */
export const LedgersReport: React.FC<{
  selectedStation: any | null;
  onNavigate?: (path: string, intent?: NavIntent) => void;
}> = ({ selectedStation, onNavigate }) => {
  const [view, setView] = useState<LedgerView>('party');
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl aria-label="Ledger view" options={VIEWS} value={view} onChange={setView} />
      {view === 'party' && <UnifiedLedger selectedStation={selectedStation} />}
      {view === 'cash-bank' && (
        <CashBankReport selectedStation={selectedStation} onNavigate={onNavigate} />
      )}
    </div>
  );
};
