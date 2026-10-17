import React, { useMemo } from 'react';
import { Drawer } from '../Drawer.js';
import {
  StatementView,
  buildLedgerStatement,
  partyEntries,
  type StatementClock,
} from '../../statement/index.js';
import { Button, DataSection, Icon, SectionHeader, StatusChip } from '../../pump-ds/index.js';
import { partyState } from '@pump/shared';
import { formatMoney } from '../../utils/format.js';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { useSupplierLedger } from '../../query/hooks.js';
import { openQuickEntry } from '../../quick-entry/store.js';

interface SupplierStatementDrawerProps {
  /** Selected supplier; null closes the drawer. */
  supplier: any | null;
  stationId: string | null;
  /** The station clock: dates a row the server sent no date for. */
  clock?: StatementClock;
  onClose: () => void;
  onEdit: (supplier: any) => void;
  onNewPurchase: (supplier: any) => void;
}

/**
 * What the station owes this supplier, in plain figures: "You owe ₹X", or, when
 * the supplier has been paid ahead (a negative payable), "Advance paid ₹X".
 * Owing a supplier is ordinary, so neither reads in a colour.
 */
export const SupplierBalance: React.FC<{ balance: number }> = ({ balance }) => (
  <div className="flex shrink-0 flex-col items-end gap-0.5" data-testid="supplier-balance">
    <span className="text-[12px] text-ink-muted">
      {balance < 0 ? `${MONEY_TERMS.advance} paid` : MONEY_TERMS.youOwe}
    </span>
    <span className="font-mono text-[18px] font-semibold text-ink-strong">
      {formatMoney(Math.abs(balance))}
    </span>
  </div>
);

const IdentityLine: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({
  label,
  children,
  mono,
}) => (
  <div className="flex gap-1.5 text-ink-muted">
    <dt className="font-semibold">{label}</dt>
    <dd className={mono ? 'font-mono' : undefined}>{children}</dd>
  </div>
);

/**
 * Supplier account statement at the selected Station (#575): summary + full
 * ledger + quick actions (Edit · Record payment · New purchase). Fetches the
 * Station's ledger with the supplier via `useSupplierLedger` (cached). Record payment opens the shared Office Record
 * drawer over the statement, with this supplier fixed.
 */
export const SupplierStatementDrawer: React.FC<SupplierStatementDrawerProps> = ({
  supplier,
  stationId,
  clock,
  onClose,
  onEdit,
  onNewPurchase,
}) => {
  // This Station's ledger with the supplier only (#575), as the row balance is.
  const ledgerQ = useSupplierLedger(stationId, supplier?.id);
  // All-time ledger: no opening balance, the running balance starts at zero.
  const timeZone = clock?.timeZone;
  const dayStartsAt = clock?.dayStartsAt;
  const statement = useMemo(
    () =>
      buildLedgerStatement(partyEntries(ledgerQ.data ?? [], 'supplier'), {
        kind: 'supplier',
        clock: { timeZone, dayStartsAt },
      }),
    [ledgerQ.data, timeZone, dayStartsAt],
  );
  const owed = Number(supplier?.currentBalance || 0);

  return (
    <Drawer
      isOpen={supplier !== null}
      onClose={onClose}
      title="Supplier statement"
      widthVariant="wide"
    >
      {supplier && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-card border border-border-soft bg-surface-alt p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <h3 className="truncate text-[15px] font-semibold text-ink-strong">
                  {supplier.name}
                </h3>
                <StatusChip status={partyState(supplier.isActive)} size="xs" />
              </div>
              <SupplierBalance balance={owed} />
            </div>

            {(supplier.metadata?.gstin ||
              supplier.metadata?.pan ||
              supplier.metadata?.billingAddress) && (
              <dl className="flex flex-col gap-1 border-t border-border-soft pt-3 text-[12px]">
                {supplier.metadata?.gstin && (
                  <IdentityLine label="GSTIN" mono>
                    {supplier.metadata.gstin}
                  </IdentityLine>
                )}
                {supplier.metadata?.pan && (
                  <IdentityLine label="PAN" mono>
                    {supplier.metadata.pan}
                  </IdentityLine>
                )}
                {supplier.metadata?.billingAddress && (
                  <IdentityLine label="Billing address">
                    {supplier.metadata.billingAddress}
                  </IdentityLine>
                )}
              </dl>
            )}
          </div>

          {/* Ledger: the Statement module, oldest first, Debit · Credit · Balance */}
          <section className="flex flex-col gap-2">
            <SectionHeader title="Statement of account" />
            <DataSection
              title="statement"
              query={ledgerQ}
              enabled
              placeholderHeight={200}
              shape="bare"
            >
              <StatementView
                statement={statement}
                scrollToEnd
                label={`${supplier.name} statement`}
                emptyMessage="No transactions recorded with this supplier yet."
              />
            </DataSection>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="edit" size="sm" />}
              onClick={() => onEdit(supplier)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="wallet" size="sm" />}
              onClick={() =>
                openQuickEntry('supplier-payment', { origin: 'statement', party: supplier })
              }
            >
              Record payment
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="cart" size="sm" />}
              onClick={() => onNewPurchase(supplier)}
            >
              New purchase
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};
