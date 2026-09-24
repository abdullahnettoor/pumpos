import React, { useState } from 'react';
import { CloudTransactionService } from '../../services/cloud.js';
import { inr } from '../../utils/format.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useCustomers, useShiftTransactions, useSuppliers } from '../../query/hooks.js';
import { Tabs } from '../primitives/Tabs.js';
import {
  Plus,
  Receipt,
  ShoppingCart,
  CreditCard,
  ArrowRight,
  TrendingDown,
  Info,
  Calendar,
} from 'lucide-react';
import { useRunTask } from '../../utils/runTask.js';
import { Form } from '../../pump-ds/index.js';

const transactionService = new CloudTransactionService();

interface ShiftTransactionsPanelProps {
  shiftId: string;
  nozzles: any[];
  onTransactionAdded?: () => void | Promise<unknown>;
  isReadOnly?: boolean;
}

export const ShiftTransactionsPanel: React.FC<ShiftTransactionsPanelProps> = ({
  shiftId,
  nozzles,
  onTransactionAdded,
  isReadOnly = false,
}) => {
  const qc = useQueryClient();
  const runTask = useRunTask();
  const [activeTab, setActiveTab] = useState<'purchases' | 'credit'>('purchases');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read through the shared query hooks rather than copying server data into
  // local state behind an effect. That was the source of three hook-rule
  // violations at once (a loader referenced before declaration, an incomplete
  // dependency list, and setState inside an effect) and it also bypassed the
  // tiered cache that docs/DATA-CACHING.md asks every read to go through.
  const suppliersQ = useSuppliers(true);
  const customersQ = useCustomers(true);
  const transactionsQ = useShiftTransactions(shiftId);

  const suppliers: any[] = suppliersQ.data ?? [];
  const customers: any[] = customersQ.data ?? [];
  // Expenses and collections are Office Records (ADR 0005) and never belong to a
  // shift, so only purchases are listed here.
  const loggedPurchases: any[] = transactionsQ.data?.purchases ?? [];

  const loading = suppliersQ.isPending || customersQ.isPending || transactionsQ.isPending;
  const loadError = suppliersQ.error || customersQ.error || transactionsQ.error;

  // Unique products derived from nozzles
  const products = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    nozzles.forEach((nz) => {
      if (nz.productId) {
        map.set(nz.productId, {
          id: nz.productId,
          name: nz.productName || 'Unknown Product',
          code: nz.productCode || '',
        });
      }
    });
    return Array.from(map.values());
  }, [nozzles]);

  // Form States - Purchase
  const [purchaseSupplierIdRaw, setPurchaseSupplierId] = useState('');
  const [purchaseProductIdRaw, setPurchaseProductId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // Form States - Credit sale (shift-anchored; customer collections are office entries)
  const [collectionCustomerIdRaw, setCollectionCustomerId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');

  // The selects used to be seeded by the loader calling setState inside an
  // effect. Derived during render instead: "whatever the operator picked, else
  // the first available option". Same visible behaviour, no cascading render,
  // and it now self-corrects when the lists arrive rather than only on mount.
  const purchaseSupplierId = purchaseSupplierIdRaw || suppliers[0]?.id || '';
  const purchaseProductId = purchaseProductIdRaw || products[0]?.id || '';
  const collectionCustomerId = collectionCustomerIdRaw || customers[0]?.id || '';

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!purchaseSupplierId || !purchaseProductId || !purchaseQuantity || !purchaseUnitPrice)
      return;

    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordPurchase({
        shiftId,
        supplierId: purchaseSupplierId,
        invoiceNumber: purchaseInvoice || undefined,
        notes: purchaseNotes || undefined,
        lines: [
          {
            productId: purchaseProductId,
            quantity: Number(purchaseQuantity),
            unitPrice: Number(purchaseUnitPrice),
          },
        ],
      });

      // Clear form
      setPurchaseQuantity('');
      setPurchaseUnitPrice('');
      setPurchaseInvoice('');
      setPurchaseNotes('');

      await qc.invalidateQueries({ queryKey: queryKeys.shiftTransactions(shiftId) });
      await onTransactionAdded?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!collectionAmount) return;

    if (!collectionCustomerId) {
      setError('A customer account must be selected for Credit Sales.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordCollection({
        shiftId,
        customerId: collectionCustomerId || undefined,
        amount: Number(collectionAmount),
        paymentMethod: 'Credit',
        notes: collectionNotes || undefined,
      });

      // Clear form
      setCollectionAmount('');
      setCollectionNotes('');

      await qc.invalidateQueries({ queryKey: queryKeys.shiftTransactions(shiftId) });
      await onTransactionAdded?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record collection');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading transactions console...
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Panel Header & Tabs */}
      <div
        style={{
          padding: '16px 20px 0 20px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: 'var(--bg-surface-alt)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Shift Transactions & Logbook
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Record fuel deliveries and credit sales against this shift. Expenses and collections
              are office entries — record them from Expenses or Customers.
            </p>
          </div>
          {isReadOnly && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-chip)',
              }}
            >
              Locked / Read-Only
            </span>
          )}
        </div>

        <Tabs
          variant="underline"
          aria-label="Shift transactions"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'purchases' | 'credit')}
          tabs={[
            {
              id: 'purchases',
              label: 'Fuel Deliveries (Purchases)',
              icon: <ShoppingCart size={14} />,
            },
            {
              id: 'credit',
              label: 'Credit Sales',
              icon: <CreditCard size={14} />,
            },
          ]}
        />
      </div>

      {/* Main Panel Content */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}
      >
        {/* Left Column: Transaction Input Form */}
        <div style={{ borderRight: '1px solid var(--border-soft)', paddingRight: '20px' }}>
          {(error || loadError) && (
            <div
              style={{
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                marginBottom: '16px',
                border: '1px solid var(--border-soft)',
              }}
            >
              {error ?? 'Could not load transaction settings. Reopen the panel to retry.'}
            </div>
          )}

          {/* Tab Form: Purchases */}
          {activeTab === 'purchases' && (
            <Form
              onSubmit={handleAddPurchase}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Record Supplier Fuel Intake
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Supplier
                </label>
                <select
                  value={purchaseSupplierId}
                  onChange={(e) => setPurchaseSupplierId(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                >
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Product / Fuel Type
                </label>
                <select
                  value={purchaseProductId}
                  onChange={(e) => setPurchaseProductId(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                >
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Volume (
                    {(products.find((p: any) => p.id === purchaseProductId) as any)?.unit || 'L'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.00"
                    value={purchaseQuantity}
                    onChange={(e) => setPurchaseQuantity(e.target.value)}
                    disabled={isReadOnly || submitting}
                    required
                    style={{
                      height: '32px',
                      padding: '0 8px',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border-strong)',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Price per{' '}
                    {(products.find((p: any) => p.id === purchaseProductId) as any)?.unit || 'L'}{' '}
                    (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={purchaseUnitPrice}
                    onChange={(e) => setPurchaseUnitPrice(e.target.value)}
                    disabled={isReadOnly || submitting}
                    required
                    style={{
                      height: '32px',
                      padding: '0 8px',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border-strong)',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Invoice Number / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-12345"
                  value={purchaseInvoice}
                  onChange={(e) => setPurchaseInvoice(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tanker drop into Tank A"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isReadOnly || submitting || !purchaseQuantity || !purchaseUnitPrice}
                style={{
                  height: '36px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isReadOnly || submitting ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : 'Record Intake'}
              </button>
            </Form>
          )}

          {/* Tab Form: Credit sales */}
          {activeTab === 'credit' && (
            <Form
              onSubmit={handleAddCollection}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Record Shift Credit Sale
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Customer Account (Required)
                </label>
                <select
                  value={collectionCustomerId}
                  onChange={(e) => setCollectionCustomerId(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                >
                  <option value="">-- Select customer --</option>
                  {customers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name} ({cust.customerType})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={collectionAmount}
                  onChange={(e) => setCollectionAmount(e.target.value)}
                  disabled={isReadOnly || submitting}
                  required
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Notes / Fleet Slip ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. Slip #9921, UPI txn ref, etc."
                  value={collectionNotes}
                  onChange={(e) => setCollectionNotes(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isReadOnly || submitting || !collectionAmount}
                style={{
                  height: '36px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isReadOnly || submitting ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : 'Log Credit Sale'}
              </button>
            </Form>
          )}
        </div>

        {/* Right Column: Transaction Logs List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Shift Logs</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              Totals in this shift
            </span>
          </h4>

          <div
            style={{
              flex: 1,
              maxHeight: '340px',
              overflowY: 'auto',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-input)',
              backgroundColor: 'var(--bg-canvas)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* Render Tab-Specific List */}
            {activeTab === 'purchases' &&
              (loggedPurchases.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                  }}
                >
                  No fuel deliveries recorded in this shift.
                </div>
              ) : (
                loggedPurchases.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        {tx.supplierName}
                      </div>
                      <div
                        style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}
                      >
                        Ref: {tx.documentNumber}{' '}
                        {tx.invoiceNumber ? `| Inv: ${tx.invoiceNumber}` : ''}
                      </div>
                      {tx.notes && (
                        <div
                          style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '1px' }}
                        >
                          {tx.notes}
                        </div>
                      )}
                    </div>
                    <div
                      style={{ fontWeight: 700, color: 'var(--text-strong)', textAlign: 'right' }}
                    >
                      {inr(tx.amount)}
                    </div>
                  </div>
                ))
              ))}

            {activeTab === 'credit' && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                Credit sales appear in the shift summary.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
