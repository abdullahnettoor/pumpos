import React, { useState } from 'react';
import { useAccess, useCustomerLedger } from '@pump/ui';
import { collectionAccess } from '../../lib/money/collection.js';
import { creditLimitAccess } from '../../lib/money/creditLimit.js';
import { balanceOf, type MoneyCustomer } from '../../lib/money/parties.js';
import type { LedgerRow } from '../../lib/money/statement.js';
import { useShell } from '../../shell/context.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { BalanceCard } from './BalanceCard.js';
import { CallButton } from './CallButton.js';
import { CreditLimitSheet } from './CreditLimitSheet.js';
import { RecordPaymentSheet } from './RecordPaymentSheet.js';
import { StatementSection } from './StatementSection.js';
import { useCustomersData } from './useMoneyData.js';

/**
 * Customer page: header (type, fleet code, phone, call), balance card and the
 * statement. Built from the customers list and the customer ledger only.
 *
 * Seams for the tickets that own what is missing here:
 *  - #398 (receivables summary): aging, last payment, usually pays in and
 *    vehicle spend go between `BalanceCard` and the Statement.
 *  - #400 (statement PDF): pass `share` / `download` to `DetailPage`; with
 *    neither, no action bar is shown.
 *  - Record payment: a quiet outline button on the balance card (not in the action
 *    bar); opens `RecordPaymentSheet`, a Collection through the existing route.
 *  - Credit limit: Owner / Manager edit it from the balance card (`CreditLimitSheet`,
 *    existing customer update route).
 *  - #413 (ranged ledger): replaces `useCustomerLedger` + the all-time
 *    `buildStatement` accumulation with server-side opening balance, ranges
 *    and paging.
 */
export const CustomerPage: React.FC<{ customer: MoneyCustomer }> = ({ customer: initial }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { customers } = useCustomersData();
  const customer = customers.find((c) => c.id === initial.id) ?? initial;

  const ledgerQ = useCustomerLedger(customer.id);

  // Owner / Manager only, and paused while Restricted Access blocks the write.
  const { role, station } = useShell();
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
        limitAction={
          limitAccess.status === 'hidden'
            ? undefined
            : {
                onPress: () => setEditingLimit(true),
                disabledReason: limitAccess.status === 'disabled' ? limitAccess.reason : undefined,
              }
        }
      />
      <StatementSection
        kind="customer"
        balance={balanceOf(customer)}
        rows={ledgerQ.data as LedgerRow[] | undefined}
        isLoading={ledgerQ.isLoading}
        isError={ledgerQ.isError}
        onRetry={() => void ledgerQ.refetch()}
      />
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
