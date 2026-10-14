import React, { useMemo } from 'react';
import { Drawer } from '../Drawer.js';
import { StatementView, buildLedgerStatement, partyEntries } from '../../statement/index.js';
import { Button, DataSection, Icon, StatusChip } from '../../pump-ds/index.js';
import { partyState } from '@pump/shared';
import { inr } from '../../utils/format.js';
import { useSupplierLedger } from '../../query/hooks.js';
import { openQuickEntry } from '../../quick-entry/store.js';

interface SupplierStatementDrawerProps {
  /** Selected supplier; null closes the drawer. */
  supplier: any | null;
  stationId: string | null;
  onClose: () => void;
  onEdit: (supplier: any) => void;
  onNewPurchase: (supplier: any) => void;
}

/**
 * Supplier account statement: summary + full ledger + quick actions
 * (Edit · Record payment · New purchase). Fetches the ledger via
 * `useSupplierLedger` (cached). Record payment opens the shared Office Record
 * drawer over the statement, with this supplier fixed.
 */
export const SupplierStatementDrawer: React.FC<SupplierStatementDrawerProps> = ({
  supplier,
  stationId,
  onClose,
  onEdit,
  onNewPurchase,
}) => {
  const ledgerQ = useSupplierLedger(supplier?.id);
  // All-time ledger: no opening balance, the running balance starts at zero.
  const statement = useMemo(
    () => buildLedgerStatement(partyEntries(ledgerQ.data ?? [], 'supplier'), { kind: 'supplier' }),
    [ledgerQ.data],
  );
  const owed = Number(supplier?.currentBalance || 0);

  return (
    <>
      <Drawer
        isOpen={supplier !== null}
        onClose={onClose}
        title="Supplier Account Statement"
        widthVariant="wide"
      >
        {supplier && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {/* Summary card */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-card)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      margin: 0,
                    }}
                  >
                    {supplier.name}
                  </h3>
                  <div style={{ marginTop: '4px' }}>
                    <StatusChip status={partyState(supplier.isActive)} size="xs" />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Owed Balance</div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: owed > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)',
                    }}
                  >
                    {inr(owed)}
                  </div>
                </div>
              </div>

              {(supplier.metadata?.gstin ||
                supplier.metadata?.pan ||
                supplier.metadata?.billingAddress) && (
                <div
                  style={{
                    borderTop: '1px solid var(--border-soft)',
                    paddingTop: '10px',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {supplier.metadata?.gstin && (
                    <div>
                      <strong>GSTIN:</strong>{' '}
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {supplier.metadata.gstin}
                      </span>
                    </div>
                  )}
                  {supplier.metadata?.pan && (
                    <div>
                      <strong>PAN:</strong>{' '}
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {supplier.metadata.pan}
                      </span>
                    </div>
                  )}
                  {supplier.metadata?.billingAddress && (
                    <div>
                      <strong>Billing Address:</strong> {supplier.metadata.billingAddress}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ledger: the Statement module, oldest first, Debit · Credit · Balance */}
            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-ink-strong">Statement of Account</h4>
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

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
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
    </>
  );
};
