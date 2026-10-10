import React from 'react';
import { useSupplierLedger } from '@pump/ui';
import { balanceOf, supplierIdentity, type MoneySupplier } from '../../lib/money/parties.js';
import type { LedgerRow } from '../../lib/money/statement.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { CallButton } from './CallButton.js';
import { StatementSection } from './StatementSection.js';
import { SupplierBalanceCard } from './SupplierBalanceCard.js';
import { useSuppliersData } from './useMoneyData.js';

/**
 * Supplier page: header (GSTIN, vendor code, call), balance card and the
 * statement of purchases and payments. Built from the suppliers list and the
 * supplier ledger only.
 *
 * Seams for the tickets that own what is missing here:
 *  - #399 (payables summary + enriched statement): oldest unpaid, purchased vs
 *    paid, purchases by product go between `SupplierBalanceCard` and the
 *    Statement; invoice / tanker / Funding Account arrive on the ledger rows.
 *  - #400 (statement PDF): pass `share` / `download` to `DetailPage`; with
 *    neither, no action bar is shown.
 *  - #413 (ranged ledger): replaces `useSupplierLedger` + the all-time
 *    `buildStatement` accumulation with server-side opening balance and ranges.
 */
export const SupplierPage: React.FC<{ supplier: MoneySupplier }> = ({ supplier: initial }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { suppliers } = useSuppliersData();
  const supplier = suppliers.find((s) => s.id === initial.id) ?? initial;

  const ledgerQ = useSupplierLedger(supplier.id);
  const subtitle = supplierIdentity(supplier).join(' · ');

  return (
    <DetailPage
      title={supplier.name}
      subtitle={subtitle || undefined}
      right={
        supplier.phone ? <CallButton name={supplier.name} phone={supplier.phone} /> : undefined
      }
    >
      <SupplierBalanceCard supplier={supplier} />
      <StatementSection
        kind="supplier"
        balance={balanceOf(supplier)}
        rows={ledgerQ.data as LedgerRow[] | undefined}
        isLoading={ledgerQ.isLoading}
        isError={ledgerQ.isError}
        onRetry={() => void ledgerQ.refetch()}
      />
    </DetailPage>
  );
};
