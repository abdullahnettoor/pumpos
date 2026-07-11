import React, { useState } from 'react';
import { Edit, Wallet, ShoppingCart } from 'lucide-react';
import { Drawer } from '../Drawer.js';
import { LedgerView } from '../ledger/LedgerView.js';
import { Button } from '../../pump-ds/index.js';
import { inr, formatDate, formatTime } from '../../utils/format.js';
import { useSupplierLedger } from '../../query/hooks.js';
import { SupplierPaymentDrawer } from './SupplierPaymentDrawer.js';

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
 * `useSupplierLedger` (cached) and owns the nested payment drawer.
 */
export const SupplierStatementDrawer: React.FC<SupplierStatementDrawerProps> = ({ supplier, stationId, onClose, onEdit, onNewPurchase }) => {
  const ledgerQ = useSupplierLedger(supplier?.id);
  const [payOpen, setPayOpen] = useState(false);
  const owed = Number(supplier?.currentBalance || 0);

  return (
    <>
      <Drawer isOpen={supplier !== null} onClose={onClose} title="Supplier Account Statement" widthVariant="wide">
        {supplier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-sans)' }}>
            {/* Summary card */}
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{supplier.name}</h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: supplier.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                    color: supplier.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-block',
                    marginTop: '4px',
                  }}>
                    {supplier.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Owed Balance</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: owed > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)' }}>
                    {inr(owed)}
                  </div>
                </div>
              </div>

              {(supplier.metadata?.gstin || supplier.metadata?.pan || supplier.metadata?.billingAddress) && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                  {supplier.metadata?.gstin && <div><strong>GSTIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{supplier.metadata.gstin}</span></div>}
                  {supplier.metadata?.pan && <div><strong>PAN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{supplier.metadata.pan}</span></div>}
                  {supplier.metadata?.billingAddress && <div><strong>Billing Address:</strong> {supplier.metadata.billingAddress}</div>}
                </div>
              )}
            </div>

            {/* Ledger */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>Ledger Statements</h4>
              <LedgerView
                entries={ledgerQ.data ?? []}
                loading={ledgerQ.isLoading}
                error={ledgerQ.error ? (ledgerQ.error as Error).message : null}
                amountLabel="Amount"
                balanceLabel="Owed Bal"
                emptyText="No transaction ledger events found."
                resolve={(tx: any) => {
                  const type = tx.transactionType;
                  const direction: 'debit' | 'credit' = type === 'Purchase' || type === 'Adjustment' ? 'debit' : 'credit';
                  return {
                    id: tx.id,
                    date: tx.createdAt,
                    dateLabel: formatDate(tx.businessDate ?? tx.createdAt, { compact: true }),
                    subLabel: formatTime(tx.createdAt),
                    type,
                    typeColor: type === 'Purchase' ? 'var(--brand-warning)' : 'var(--state-success-fg)',
                    notes: tx.notes,
                    amount: Number(tx.amount),
                    direction,
                  };
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" leftIcon={<Edit />} onClick={() => onEdit(supplier)}>Edit</Button>
              <Button variant="secondary" size="sm" leftIcon={<Wallet />} onClick={() => setPayOpen(true)}>Record payment</Button>
              <Button variant="secondary" size="sm" leftIcon={<ShoppingCart />} onClick={() => onNewPurchase(supplier)}>New purchase</Button>
            </div>
          </div>
        )}
      </Drawer>

      <SupplierPaymentDrawer
        isOpen={payOpen}
        supplier={supplier}
        stationId={stationId}
        onClose={() => setPayOpen(false)}
        onDone={() => ledgerQ.refetch()}
      />
    </>
  );
};
