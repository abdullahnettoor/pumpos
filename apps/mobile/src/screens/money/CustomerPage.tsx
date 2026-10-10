import React, { useState } from 'react';
import { customerStatementParty, useAccess, useToast } from '@pump/ui';
import type { Station } from '@pump/shared';
import { collectionAccess } from '../../lib/money/collection.js';
import { creditLimitAccess } from '../../lib/money/creditLimit.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import { useShell } from '../../shell/context.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { BalanceCard } from './BalanceCard.js';
import { BehaviourTiles } from './BehaviourTiles.js';
import { CallButton } from './CallButton.js';
import { CreditLimitSheet } from './CreditLimitSheet.js';
import { RecordPaymentSheet } from './RecordPaymentSheet.js';
import { PartyStatement } from './PartyStatement.js';
import { useCustomerReceivableData, useCustomersData } from './useMoneyData.js';
import { usePartyStatement } from './usePartyStatement.js';
import { VehicleSpend } from './VehicleSpend.js';

/**
 * Customer page: header (type, fleet code, phone, call), the balance card with
 * its aging split, how the customer pays (last payment, usually pays in, this
 * month), Vehicles · this month, and the Statement.
 *
 * The aging, behaviour tiles and vehicles come from the receivables summary and
 * appear when it arrives; a failed or missing summary leaves the balance card
 * and the statement standing on their own. The statement is the ranged ledger:
 * this month by default (or the range picked in the Filter) with each Credit
 * Sale's Shift, product, litres and Vehicle and each Collection's method and
 * reference, and what came before carried in as a balance. "Earlier months"
 * (default window only, see `PartyStatement`) adds one more month whenever any
 * older entry exists (the server says so), also for a customer settled before it.
 *
 * Two quiet actions sit on the balance card (not in the action bar):
 *  - Record payment: opens `RecordPaymentSheet`, a Collection through the existing
 *    route; every Role except Attendant.
 *  - Credit limit: Owner / Manager edit it (`CreditLimitSheet`, existing customer
 *    update route).
 *
 * Share and Download statement print the range the statement shows (see
 * `usePartyStatement`).
 */
export const CustomerPage: React.FC<{
  customer: MoneyCustomer;
  /** The selected Station: its clock ages the receivables and anchors "this month". */
  station?: Station | null;
}> = ({ customer: initial, station: stationProp = null }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { customers } = useCustomersData();
  const customer = customers.find((c) => c.id === initial.id) ?? initial;

  const { role, station: shellStation } = useShell();
  const station = stationProp ?? shellStation;
  const receivable = useCustomerReceivableData(station?.id, customer.id);
  const toast = useToast();
  const statement = usePartyStatement({
    kind: 'customer',
    partyId: customer.id,
    party: customerStatementParty(customer),
    station,
    balance: balanceOf(customer),
  });

  // Owner / Manager only, and paused while Restricted Access blocks the write.
  const accessMode = useAccess().data?.subscription.mode;
  const limitAccess = creditLimitAccess({
    role,
    customerType: customer.customerType,
    accessMode,
  });
  const [editingLimit, setEditingLimit] = useState(false);

  // Every Role except Attendant (the server's collection guard); only Suspension pauses it,
  // since a Collection finishes work already done (FINISH_OPEN_WORK). No station, no Office Record.
  const paymentAccess = station
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
      share={statement.share}
      download={statement.download}
      onActionError={(message) => toast.error(message)}
    >
      <BalanceCard
        customer={customer}
        aging={receivable.summary?.aging}
        paymentAction={
          paymentAccess.status === 'hidden'
            ? undefined
            : {
                onPress: () => setRecordingPayment(true),
                disabledReason:
                  paymentAccess.status === 'disabled' ? paymentAccess.reason : undefined,
              }
        }
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
      <PartyStatement statement={statement} />
      <CreditLimitSheet
        open={editingLimit}
        customer={customer}
        onClose={() => setEditingLimit(false)}
      />
      {station && (
        <RecordPaymentSheet
          open={recordingPayment}
          customer={customer}
          stationId={station.id}
          timeZone={station.settings?.timezone}
          onClose={() => setRecordingPayment(false)}
        />
      )}
    </DetailPage>
  );
};
