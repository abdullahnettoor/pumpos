import React, { useState } from 'react';
import { useAccess, useToast } from '@pump/ui';
import type { Station } from '@pump/shared';
import { supplierPaymentAccess } from '../../lib/money/supplierPayment.js';
import { balanceOf, supplierIdentity, type MoneySupplier } from '../../lib/money/parties.js';
import { supplierPdfParty } from '../../lib/money/statementPdf.js';
import { rangeLabel } from '../../lib/money/statementRange.js';
import { useShell } from '../../shell/context.js';
import { DetailPage } from '../../ui/DetailPage.js';
import { CallButton } from './CallButton.js';
import { PaySupplierSheet } from './PaySupplierSheet.js';
import { PurchasesByProduct } from './PurchasesByProduct.js';
import { StatementFilterSheet } from './StatementFilterSheet.js';
import { StatementSection } from './StatementSection.js';
import { SupplierBalanceCard } from './SupplierBalanceCard.js';
import { SupplierMonthTiles } from './SupplierMonthTiles.js';
import { useStatementPdf } from './useStatementPdf.js';
import { useStatementRange } from './useStatementRange.js';
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
 * ranged ledger: this month by default (or the range picked in the Filter) with each Purchase's invoice, quantity and
 * tanker (when one was recorded) and each Payment's method and Funding Account,
 * and what came before carried in as a balance. "Earlier months" adds one more
 * month whenever any older entry exists (the server says so). A negative running
 * balance is an advance.
 *
 * No due dates: suppliers have no payment terms in the data.
 *
 * Record payment: a quiet outline button on the balance card (not in the action
 * bar); opens `PaySupplierSheet`, a Supplier Payment through the existing route.
 *
 * The statement shows one range, this month until the Filter picks another or
 * "Earlier months" adds one; Share and Download statement print that same range
 * (see `useStatementPdf`).
 */
export const SupplierPage: React.FC<{
  supplier: MoneySupplier;
  /** The selected Station: its clock anchors "this month" and the age of the oldest unpaid Purchase. */
  station?: Station | null;
}> = ({ supplier: initial, station: stationProp = null }) => {
  // The list row is a snapshot; read the live entry so a refreshed balance shows.
  const { suppliers } = useSuppliersData();
  const supplier = suppliers.find((s) => s.id === initial.id) ?? initial;

  const shell = useShell();
  const { role } = shell;
  const station = stationProp ?? shell.station;

  const payable = useSupplierPayableData(station?.id, supplier.id);
  const toast = useToast();
  const statementRange = useStatementRange(station);
  const { range } = statementRange;
  const statement = useSupplierStatementData(supplier.id, range);
  const opening = Number(statement.ledger?.periodOpeningBalance ?? 0) || 0;
  const [filtering, setFiltering] = useState(false);
  const pdf = useStatementPdf({
    kind: 'supplier',
    party: supplierPdfParty(supplier),
    station,
    range,
    ledger: statement.ledger,
    pending: statement.isLoading || statement.isFetchingMore || statement.isError,
  });
  const subtitle = supplierIdentity(supplier).join(' · ');

  // Owner / Manager / Accountant (the server's guard); only Suspension pauses it, since a
  // payment already made must be recorded (FINISH_OPEN_WORK). No station, no Office Record.
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
      share={pdf.share}
      download={pdf.download}
      onActionError={(message) => toast.error(message)}
    >
      <SupplierBalanceCard
        supplier={supplier}
        payable={payable.summary}
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
      {payable.summary && <SupplierMonthTiles summary={payable.summary} />}
      {payable.summary && <PurchasesByProduct products={payable.summary.purchasesByProduct} />}
      <StatementSection
        kind="supplier"
        // The range's own closing balance: a past range does not end on today's balance.
        balance={statement.ledger ? Number(statement.ledger.closingBalance) : balanceOf(supplier)}
        onFilter={() => setFiltering(true)}
        rows={statement.ledger?.entries}
        isLoading={statement.isLoading}
        isError={statement.isError}
        onRetry={() => void statement.refetch()}
        period={
          statement.ledger
            ? {
                from: range.from,
                label: rangeLabel(range),
                openingBalance: opening,
                // Anything dated before the range can be loaded, even when it nets to 0. A range
                // picked by hand stays as picked (the Filter changes it).
                onEarlier:
                  statement.ledger.hasEarlier && statementRange.choice.kind === 'recent'
                    ? statementRange.widen
                    : undefined,
                isLoadingEarlier: statement.isFetchingMore,
              }
            : undefined
        }
      />
      <StatementFilterSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        today={statementRange.today}
        choice={statementRange.choice}
        onApply={statementRange.choose}
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
