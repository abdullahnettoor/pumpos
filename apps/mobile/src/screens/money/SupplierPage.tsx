import React, { useState } from 'react';
import { useAccess, useSupplierLedger } from '@pump/ui';
import { supplierPaymentAccess } from '../../lib/money/supplierPayment.js';
import { balanceOf, supplierIdentity, type MoneySupplier } from '../../lib/money/parties.js';
import type { LedgerRow } from '../../lib/money/statement.js';
import { useShell } from '../../shell/context.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { CallButton } from './CallButton.js';
import { PaySupplierSheet } from './PaySupplierSheet.js';
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
 *  - Record payment: a quiet outline button on the balance card (not in the action
 *    bar); opens `PaySupplierSheet`, a Supplier Payment through the existing route.
 *  - #413 (ranged ledger): replaces `useSupplierLedger` + the all-time
 *    `buildStatement` accumulation with server-side opening balance and ranges.
 */
export const SupplierPage: React.FC<{ supplier: MoneySupplier }> = ({ supplier: initial }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { suppliers } = useSuppliersData();
  const supplier = suppliers.find((s) => s.id === initial.id) ?? initial;

  const ledgerQ = useSupplierLedger(supplier.id);
  const subtitle = supplierIdentity(supplier).join(' · ');

  // Owner / Manager / Accountant (the server's guard); only Suspension pauses it, since a
  // payment already made must be recorded (FINISH_OPEN_WORK). No station, no Office Record.
  const { role, station } = useShell();
  const accessMode = useAccess().data?.subscription.mode;
  const paymentAccess = station
    ? supplierPaymentAccess({ role, accessMode })
    : { status: 'hidden' as const };
  const [paying, setPaying] = useState(false);

  return (
    <DetailPage
      title={supplier.name}
      subtitle={subtitle || undefined}
      right={
        supplier.phone ? <CallButton name={supplier.name} phone={supplier.phone} /> : undefined
      }
    >
      <SupplierBalanceCard
        supplier={supplier}
        paymentAction={
          paymentAccess.status === 'hidden'
            ? undefined
            : {
                onPress: () => setPaying(true),
                disabledReason:
                  paymentAccess.status === 'disabled' ? paymentAccess.reason : undefined,
              }
        }
      />
      <StatementSection
        kind="supplier"
        balance={balanceOf(supplier)}
        rows={ledgerQ.data as LedgerRow[] | undefined}
        isLoading={ledgerQ.isLoading}
        isError={ledgerQ.isError}
        onRetry={() => void ledgerQ.refetch()}
      />
      {station && (
        <PaySupplierSheet
          open={paying}
          supplier={supplier}
          stationId={station.id}
          timeZone={station.settings?.timezone}
          onClose={() => setPaying(false)}
        />
      )}
    </DetailPage>
  );
};
