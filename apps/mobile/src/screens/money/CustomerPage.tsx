import React, { useState } from 'react';
import { useAccess } from '@pump/ui';
import type { Station } from '@pump/shared';
import { collectionAccess } from '../../lib/money/collection.js';
import { creditLimitAccess } from '../../lib/money/creditLimit.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { STATEMENT_MONTHS } from '../../lib/money/statement.js';
import { useShell } from '../../shell/context.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { BalanceCard } from './BalanceCard.js';
import { BehaviourTiles } from './BehaviourTiles.js';
import { CallButton } from './CallButton.js';
import { CreditLimitSheet } from './CreditLimitSheet.js';
import { RecordPaymentSheet } from './RecordPaymentSheet.js';
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
 * Record payment: a quiet outline button on the balance card (not in the action
 * bar); opens `RecordPaymentSheet`, a Collection through the existing route.
 * Owner / Manager edit the credit limit from the balance card (`CreditLimitSheet`,
 * existing customer update route).
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

  // Owner / Manager only, and paused while Restricted Access blocks the write.
  const { role, station: shellStation } = useShell();
  const accessMode = useAccess().data?.subscription.mode;
  const limitAccess = creditLimitAccess({
    role,
    customerType: customer.customerType,
    accessMode,
  });
  const [editingLimit, setEditingLimit] = useState(false);

  // The page's station, else the shell's (the same one in the app). Every Role except Attendant (the server's collection guard); only Suspension pauses it,
  // since a Collection finishes work already done (FINISH_OPEN_WORK). No station, no Office Record.
  const paymentStation = station ?? shellStation;
  const paymentAccess = paymentStation
    ? collectionAccess({ role, accessMode })
    : { status: 'hidden' as const };
  const [recordingPayment, setRecordingPayment] = useState(false);

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
      <BalanceCard
        customer={customer}
        paymentAction={
          paymentAccess.status === 'hidden'
            ? undefined
            : {
                onPress: () => setRecordingPayment(true),
                disabledReason:
                  paymentAccess.status === 'disabled' ? paymentAccess.reason : undefined,
              }
        }
        aging={receivable.summary?.aging}
        limitAction={
          limitAccess.status === 'hidden'
            ? undefined
            : {
                onPress: () => setEditingLimit(true),
                disabledReason: limitAccess.status === 'disabled' ? limitAccess.reason : undefined,
              }
        }
      />
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
      <CreditLimitSheet
        open={editingLimit}
        customer={customer}
        onClose={() => setEditingLimit(false)}
      />
      {paymentStation && (
        <RecordPaymentSheet
          open={recordingPayment}
          customer={customer}
          stationId={paymentStation.id}
          timeZone={paymentStation.settings?.timezone}
          onClose={() => setRecordingPayment(false)}
        />
      )}
    </DetailPage>
  );
};
