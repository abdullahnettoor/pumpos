import React, { useState } from 'react';
import type { Station } from '@pump/shared';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { STATEMENT_MONTHS } from '../../lib/money/statement.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { BalanceCard } from './BalanceCard.js';
import { BehaviourTiles } from './BehaviourTiles.js';
import { CallButton } from './CallButton.js';
import { StatementSection } from './StatementSection.js';
import {
  useCustomerReceivableData,
  useCustomersData,
  useCustomerStatementData,
} from './useMoneyData.js';
import { VehicleSpend } from './VehicleSpend.js';

/**
 * Customer page: header (type, fleet code, phone, call), the balance card with
 * its aging split, how the customer pays (last payment, usually pays in, this
 * month), Vehicles · this month, and the Statement.
 *
 * The aging, behaviour tiles and vehicles come from the receivables summary and
 * appear when it arrives; a failed or missing summary leaves the balance card
 * and the statement standing on their own. The statement is the ranged ledger:
 * the last 6 months with each Credit Sale's Shift, product, litres and Vehicle
 * and each Collection's method and reference, and what came before carried in
 * as a balance. "Earlier months" fetches 6 more whenever any older entry exists
 * (the server says so), also for a customer settled before the window.
 *
 * Seam for #400 (statement PDF): pass `share` / `download` to `DetailPage`; with
 * neither, no action bar is shown.
 */
export const CustomerPage: React.FC<{
  customer: MoneyCustomer;
  /** The selected Station: its clock ages the receivables and anchors "this month". */
  station?: Station | null;
}> = ({ customer: initial, station = null }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { customers } = useCustomersData();
  const customer = customers.find((c) => c.id === initial.id) ?? initial;

  const receivable = useCustomerReceivableData(station?.id, customer.id);
  const [months, setMonths] = useState(STATEMENT_MONTHS);
  const statement = useCustomerStatementData(customer.id, station, months);
  const opening = Number(statement.ledger?.periodOpeningBalance ?? 0) || 0;

  const subtitle = [customer.customerType, customer.fleetCode, customer.phone]
    .filter(Boolean)
    .join(' · ');

  return (
    <DetailPage
      title={customer.name}
      subtitle={subtitle || undefined}
      right={
        customer.phone ? <CallButton name={customer.name} phone={customer.phone} /> : undefined
      }
    >
      <BalanceCard customer={customer} aging={receivable.summary?.aging} />
      {receivable.summary && <BehaviourTiles summary={receivable.summary} />}
      {receivable.summary && <VehicleSpend vehicles={receivable.summary.vehicles} />}
      <StatementSection
        kind="customer"
        balance={balanceOf(customer)}
        rows={statement.ledger?.entries}
        isLoading={statement.isLoading}
        isError={statement.isError}
        onRetry={() => void statement.refetch()}
        period={
          statement.ledger
            ? {
                from: statement.from,
                openingBalance: opening,
                // Anything dated before the window can be loaded, even when it nets to 0:
                // a customer settled before the window still has history to read.
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
