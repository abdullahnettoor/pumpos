import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../../services/cloud.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, TIER } from '../../query/hooks.js';
import { 
  Plus, 
  Coins, 
  Receipt, 
  ShoppingCart, 
  CreditCard, 
  ArrowRight,
  TrendingDown,
  Info,
  Calendar
} from 'lucide-react';

const transactionService = new CloudTransactionService();

interface ShiftTransactionsPanelProps {
  shiftId: string;
  nozzles: any[];
  onTransactionAdded?: () => void;
  isReadOnly?: boolean;
}

export const ShiftTransactionsPanel: React.FC<ShiftTransactionsPanelProps> = ({
  shiftId,
  nozzles,
  onTransactionAdded,
  isReadOnly = false,
}) => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'expenses' | 'purchases' | 'collections'>('expenses');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lists fetched from DB
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loggedTransactions, setLoggedTransactions] = useState<{
    expenses: any[];
    purchases: any[];
    collections: any[];
  }>({ expenses: [], purchases: [], collections: [] });

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

  // Form States - Expense
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');

  // Form States - Purchase
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseProductId, setPurchaseProductId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // Form States - Collection
  const [collectionCustomerId, setCollectionCustomerId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Credit'>('Cash');
  const [collectionNotes, setCollectionNotes] = useState('');

  useEffect(() => {
    loadData();
  }, [shiftId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [cats, sups, custs, txs] = await Promise.all([
        qc.ensureQueryData({ queryKey: queryKeys.expenseCategories(), queryFn: () => transactionService.getExpenseCategories(), staleTime: TIER.semi.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.suppliers(true), queryFn: () => transactionService.getSuppliers(), staleTime: TIER.semi.staleTime }),
        qc.ensureQueryData({ queryKey: queryKeys.customers(true), queryFn: () => transactionService.getCustomers(), staleTime: TIER.semi.staleTime }),
        transactionService.getShiftTransactions(shiftId),
      ]);

      setCategories(cats || []);
      setSuppliers(sups || []);
      setCustomers(custs || []);
      setLoggedTransactions(txs || { expenses: [], purchases: [], collections: [] });

      // Set initial defaults
      if (cats && cats.length > 0) setExpenseCategoryId(cats[0].id);
      if (sups && sups.length > 0) setPurchaseSupplierId(sups[0].id);
      if (products && products.length > 0) setPurchaseProductId(products[0].id);
      if (custs && custs.length > 0) setCollectionCustomerId(custs[0].id);
    } catch (err: any) {
      setError(err.message || 'Failed to load transaction settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!expenseCategoryId || !expenseAmount) return;

    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordExpense({
        shiftId,
        categoryId: expenseCategoryId,
        amount: Number(expenseAmount),
        description: expenseDescription || undefined,
      });

      // Clear form
      setExpenseAmount('');
      setExpenseDescription('');

      // Reload
      const txs = await transactionService.getShiftTransactions(shiftId);
      setLoggedTransactions(txs);
      onTransactionAdded?.();
    } catch (err: any) {
      setError(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!purchaseSupplierId || !purchaseProductId || !purchaseQuantity || !purchaseUnitPrice) return;

    try {
      setSubmitting(true);
      setError(null);
      await transactionService.recordPurchase({
        shiftId,
        supplierId: purchaseSupplierId,
        invoiceNumber: purchaseInvoice || undefined,
        notes: purchaseNotes || undefined,
        lines: [{
          productId: purchaseProductId,
          quantity: Number(purchaseQuantity),
          unitPrice: Number(purchaseUnitPrice),
        }],
      });

      // Clear form
      setPurchaseQuantity('');
      setPurchaseUnitPrice('');
      setPurchaseInvoice('');
      setPurchaseNotes('');

      // Reload
      const txs = await transactionService.getShiftTransactions(shiftId);
      setLoggedTransactions(txs);
      onTransactionAdded?.();
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

    // For 'Credit' payment method, a customer must be selected
    if (collectionMethod === 'Credit' && !collectionCustomerId) {
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
        paymentMethod: collectionMethod,
        notes: collectionNotes || undefined,
      });

      // Clear form
      setCollectionAmount('');
      setCollectionNotes('');

      // Reload
      const txs = await transactionService.getShiftTransactions(shiftId);
      setLoggedTransactions(txs);
      onTransactionAdded?.();
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
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '0px',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Panel Header & Tabs */}
      <div style={{
        padding: '16px 20px 0 20px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: 'var(--bg-surface-alt)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Shift Transactions & Logbook
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Record expenses, fuel drops, credit sales, and payment collections directly against this shift.
            </p>
          </div>
          {isReadOnly && (
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'var(--state-danger-bg)',
              color: 'var(--state-danger-fg)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-chip)'
            }}>
              Locked / Read-Only
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '-1px' }}>
          <button
            className={`btn ${activeTab === 'expenses' ? 'btn-ghost' : ''} btn-md`} style={{ borderBottom: activeTab === 'expenses' ? '2px solid var(--brand-primary)' : '2px solid transparent' }}
            onClick={() => setActiveTab('expenses')}
          >
            <Coins size={14} /> Petty Expenses
          </button>
          <button
            className={`btn ${activeTab === 'purchases' ? 'btn-ghost' : ''} btn-md`} style={{ borderBottom: activeTab === 'purchases' ? '2px solid var(--brand-primary)' : '2px solid transparent' }}
            onClick={() => setActiveTab('purchases')}
          >
            <ShoppingCart size={14} /> Fuel Deliveries (Purchases)
          </button>
          <button
            className={`btn ${activeTab === 'collections' ? 'btn-ghost' : ''} btn-md`} style={{ borderBottom: activeTab === 'collections' ? '2px solid var(--brand-primary)' : '2px solid transparent' }}
            onClick={() => setActiveTab('collections')}
          >
            <CreditCard size={14} /> Credit Sales & Collections
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', padding: '20px' }}>
        {/* Left Column: Transaction Input Form */}
        <div style={{ borderRight: '1px solid var(--border-soft)', paddingRight: '20px' }}>
          {error && (
            <div style={{
              backgroundColor: 'var(--state-danger-bg)',
              color: 'var(--state-danger-fg)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              marginBottom: '16px',
              border: '1px solid var(--border-soft)'
            }}>
              {error}
            </div>
          )}

          {/* Tab Form: Expenses */}
          {activeTab === 'expenses' && (
            <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Record Petty Expense</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Category</label>
                <select
                  value={expenseCategoryId}
                  onChange={(e) => setExpenseCategoryId(e.target.value)}
                  disabled={isReadOnly || submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Amount (₹)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
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
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Description</label>
                <input
                  type="text"
                  placeholder="e.g. Snacks for staff, Generator Oil, etc."
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
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
                disabled={isReadOnly || submitting || !expenseAmount}
                style={{
                  height: '36px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: (isReadOnly || submitting) ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : 'Add Expense'}
              </button>
            </form>
          )}

          {/* Tab Form: Purchases */}
          {activeTab === 'purchases' && (
            <form onSubmit={handleAddPurchase} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Record Supplier Fuel Intake</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Supplier</label>
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
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Product / Fuel Type</label>
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
                    <option key={prod.id} value={prod.id}>{prod.name} ({prod.code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Volume (Liters)</label>
                  <input
                    type="number"
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
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Price per Liter (₹)</label>
                  <input
                    type="number"
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
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Invoice Number / Reference</label>
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
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes</label>
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
                  cursor: (isReadOnly || submitting) ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : 'Record Intake'}
              </button>
            </form>
          )}

          {/* Tab Form: Collections */}
          {activeTab === 'collections' && (
            <form onSubmit={handleAddCollection} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Record Shift Credit Sale / Collection</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Entry Type / Payment Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                  {(['Cash', 'Card', 'UPI', 'Credit'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setCollectionMethod(method)}
                      disabled={isReadOnly || submitting}
                      style={{
                        height: '32px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: collectionMethod === method ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                        color: collectionMethod === method ? 'white' : 'var(--text-default)',
                        border: collectionMethod === method ? 'none' : '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Customer Account {collectionMethod === 'Credit' ? '(Required)' : '(Optional for Walk-in)'}
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
                  <option value="">-- Walk-in / General --</option>
                  {customers.map((cust) => (
                    <option key={cust.id} value={cust.id}>{cust.name} ({cust.customerType})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Amount (₹)</label>
                <input
                  type="number"
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
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes / Fleet Slip ID</label>
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
                  cursor: (isReadOnly || submitting) ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : collectionMethod === 'Credit' ? 'Log Credit Sale' : 'Log Collection'}
              </button>
            </form>
          )}
        </div>

        {/* Right Column: Transaction Logs List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Shift Logs</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              Totals in this shift
            </span>
          </h4>

          <div style={{
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
          }}>
            {/* Render Tab-Specific List */}
            {activeTab === 'expenses' && (
              loggedTransactions.expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No expenses recorded in this shift.
                </div>
              ) : (
                loggedTransactions.expenses.map((tx) => (
                  <div key={tx.id} style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        {tx.categoryName}
                      </div>
                      {tx.description && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                          {tx.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--brand-danger)' }}>
                      - ₹{Number(tx.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'purchases' && (
              loggedTransactions.purchases.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No fuel deliveries recorded in this shift.
                </div>
              ) : (
                loggedTransactions.purchases.map((tx) => (
                  <div key={tx.id} style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        {tx.supplierName}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                        Ref: {tx.documentNumber} {tx.invoiceNumber ? `| Inv: ${tx.invoiceNumber}` : ''}
                      </div>
                      {tx.notes && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '1px' }}>
                          {tx.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-strong)', textAlign: 'right' }}>
                      ₹{Number(tx.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'collections' && (
              loggedTransactions.collections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No collections or credit sales logged.
                </div>
              ) : (
                loggedTransactions.collections.map((tx) => (
                  <div key={tx.id} style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{tx.customerName}</span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: tx.paymentMethod === 'Credit' ? 'var(--state-warning-bg)' : 'var(--state-success-bg)',
                          color: tx.paymentMethod === 'Credit' ? 'var(--state-warning-fg)' : 'var(--state-success-fg)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}>
                          {tx.paymentMethod}
                        </span>
                      </div>
                      {tx.notes && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                          {tx.notes}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontWeight: 700,
                      color: tx.paymentMethod === 'Credit' ? 'var(--text-muted)' : 'var(--state-success-fg)'
                    }}>
                      {tx.paymentMethod === 'Credit' ? '' : '+ '}₹{Number(tx.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          {/* Quick Metrics Summary */}
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-surface-alt)',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            border: '1px solid var(--border-soft)',
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Petty Expenses:</span>
              <strong style={{ display: 'block', fontSize: '13px', color: 'var(--brand-danger)' }}>
                ₹{loggedTransactions.expenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cash Collections:</span>
              <strong style={{ display: 'block', fontSize: '13px', color: 'var(--state-success-fg)' }}>
                ₹{loggedTransactions.collections.filter(c => c.paymentMethod === 'Cash').reduce((sum, c) => sum + Number(c.amount), 0).toLocaleString('en-IN')}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
