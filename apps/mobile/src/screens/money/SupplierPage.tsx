import React, { useState } from 'react';
import type { Station } from '@pump/shared';
import { balanceOf, supplierIdentity, type MoneySupplier } from '../../lib/money/parties.js';
import { STATEMENT_MONTHS } from '../../lib/money/statement.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { CallButton } from './CallButton.js';
import { PurchasesByProduct } from './PurchasesByProduct.js';
import { StatementSection } from './StatementSection.js';
import { SupplierBalanceCard } from './SupplierBalanceCard.js';
import { SupplierMonthTiles } from './SupplierMonthTiles.js';
import {
  useSuppliersData,
  useSupplierPayableData,
  useSupplierStatementData,
} from './useMoneyData.js';

/**
 * Supplier page: header (GSTIN, vendor code, call), the balance card with the
 * oldest unpaid Purchase, this month's purchased vs paid, purchases by product,
 * and the Statement.
 *
 * The oldest-unpaid line, the tiles and the products come from the payables
 * summary and appear when it arrives; a failed or missing summary leaves the
 * balance card and the statement standing on their own. The statement is the
 * ranged ledger: the last 6 months with each Purchase's invoice, quantity and
 * tanker (when one was recorded) and each Payment's method and Funding Account,
 * and what came before carried in as a balance. "Earlier months" fetches 6 more
 * whenever any older entry exists (the server says so). A negative running
 * balance is an advance.
 *
 * No due dates: suppliers have no payment terms in the data.
 *
 * Seam for #400 (statement PDF): pass `share` / `download` to `DetailPage`; with
 * neither, no action bar is shown.
 */
export const SupplierPage: React.FC<{
  supplier: MoneySupplier;
  /** The selected Station: its clock anchors "this month" and the age of the oldest unpaid Purchase. */
  station?: Station | null;
}> = ({ supplier: initial, station = null }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { suppliers } = useSuppliersData();
  const supplier = suppliers.find((s) => s.id === initial.id) ?? initial;

  const payable = useSupplierPayableData(station?.id, supplier.id);
  const [months, setMonths] = useState(STATEMENT_MONTHS);
  const statement = useSupplierStatementData(supplier.id, station, months);
  const opening = Number(statement.ledger?.periodOpeningBalance ?? 0) || 0;
  const subtitle = supplierIdentity(supplier).join(' · ');

  return (
    <DetailPage
      title={supplier.name}
      subtitle={subtitle || undefined}
      right={
        supplier.phone ? <CallButton name={supplier.name} phone={supplier.phone} /> : undefined
      }
    >
      <SupplierBalanceCard supplier={supplier} payable={payable.summary} />
      {payable.summary && <SupplierMonthTiles summary={payable.summary} />}
      {payable.summary && <PurchasesByProduct products={payable.summary.purchasesByProduct} />}
      <StatementSection
        kind="supplier"
        balance={balanceOf(supplier)}
        rows={statement.ledger?.entries}
        isLoading={statement.isLoading}
        isError={statement.isError}
        onRetry={() => void statement.refetch()}
        period={
          statement.ledger
            ? {
                from: statement.from,
                openingBalance: opening,
                // Anything dated before the window can be loaded, even when it nets to 0.
                onEarlier: statement.ledger.hasEarlier
                  ? () => setMonths((m) => m + STATEMENT_MONTHS)
                  : undefined,
                isLoadingEarlier: statement.isFetchingMore,
              }
            : undefined
        }
      />
    </DetailPage>
  );
};
