import React from 'react';
import { Edit, Wallet } from 'lucide-react';
import { Drawer } from '../Drawer.js';
import { LedgerView } from '../ledger/LedgerView.js';
import { Button } from '../../pump-ds/index.js';
import { inr, formatDate, formatTime } from '../../utils/format.js';
import { useCustomerLedger } from '../../query/hooks.js';

interface StatementDrawerProps {
  /** Selected customer; null closes the drawer. */
  customer: any | null;
  stationId: string | null;
  onClose: () => void;
  /** Open the edit-profile drawer for this customer (container closes statement). */
  onEdit: (customer: any) => void;
  /** Open the collection drawer pre-filled for this customer. */
  onRecordCollection: (customer: any) => void;
}

/**
 * Customer account statement: summary card + full ledger + quick actions.
 * Fetches the ledger via `useCustomerLedger` (cached) and owns the nested
 * prepaid top-up drawer.
 */
export const StatementDrawer: React.FC<StatementDrawerProps> = ({ customer, stationId, onClose, onEdit, onRecordCollection }) => {
  const ledgerQ = useCustomerLedger(customer?.id);

  return (
    <>
      <Drawer isOpen={customer !== null} onClose={onClose} title="Customer Account Statement" widthVariant="wide">
        {customer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-sans)' }}>
            {/* Customer Summary Card */}
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{customer.name}</h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: customer.customerType === 'Fleet' ? 'var(--state-info-bg)' : customer.customerType === 'Credit' ? 'var(--state-warning-bg)' : 'var(--bg-surface)',
                    color: customer.customerType === 'Fleet' ? 'var(--state-info-fg)' : customer.customerType === 'Credit' ? 'var(--state-warning-fg)' : 'var(--text-strong)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-block',
                    marginTop: '4px',
                  }}>
                    {customer.customerType}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Outstanding Balance
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: customer.creditLimit > 0 && customer.currentBalance > customer.creditLimit
                      ? 'var(--brand-danger)'
                      : customer.currentBalance > 0
                        ? 'var(--brand-warning)'
                        : 'var(--state-success-fg)',
                  }}>
                    {inr(customer.currentBalance || 0)}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Credit Limit</span>
                  <strong style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    {customer.creditLimit > 0 ? inr(customer.creditLimit) : 'N/A'}
                  </strong>
                </div>
                {customer.creditLimit > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Available Credit</span>
                    <strong style={{ color: (customer.creditLimit - customer.currentBalance) < 0 ? 'var(--brand-danger)' : 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                      {inr(Math.max(0, Number(customer.creditLimit) - Number(customer.currentBalance)))}
                    </strong>
                  </div>
                )}
              </div>

              {customer.isPrepaid && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wallet size={13} /> OMC fleet card — fuel is settled to the OMC (CMS account), not billed to this customer.
                </div>
              )}

              {(customer.metadata?.gstin || customer.metadata?.pan || customer.metadata?.billingAddress) && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                  {customer.metadata?.gstin && <div><strong>GSTIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{customer.metadata.gstin}</span></div>}
                  {customer.metadata?.pan && <div><strong>PAN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{customer.metadata.pan}</span></div>}
                  {customer.metadata?.billingAddress && <div><strong>Billing Address:</strong> {customer.metadata.billingAddress}</div>}
                </div>
              )}
            </div>

            {/* Ledger */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>Statement of Account</h4>
              <LedgerView
                entries={ledgerQ.data ?? []}
                loading={ledgerQ.isLoading}
                error={ledgerQ.error ? (ledgerQ.error as Error).message : null}
                amountLabel="Amount"
                balanceLabel="Balance"
                emptyText="No transaction history found for this account."
                resolve={(tx: any) => {
                  const type = tx.transactionType;
                  const direction: 'debit' | 'credit' =
                    type === 'Credit Sale' || type === 'Adjustment' || type === 'Prepaid Top-up' ? 'debit' : 'credit';
                  const typeColor =
                    type === 'Credit Sale' ? 'var(--brand-warning)' : type === 'Prepaid Top-up' ? 'var(--state-success-fg)' : undefined;
                  return {
                    id: tx.id,
                    date: tx.createdAt,
                    dateLabel: formatDate(tx.businessDate ?? tx.createdAt, { compact: true }),
                    subLabel: formatTime(tx.createdAt),
                    type,
                    typeColor,
                    notes: tx.notes,
                    amount: Number(tx.amount),
                    direction,
                  };
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <Button variant="secondary" size="sm" leftIcon={<Edit />} onClick={() => onEdit(customer)}>Edit profile</Button>
              <Button variant="secondary" size="sm" leftIcon={<Wallet />} onClick={() => onRecordCollection(customer)}>Record collection</Button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
};
