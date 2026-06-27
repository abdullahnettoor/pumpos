import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { usePurchases, useShiftStatus, useSuppliers, useProducts, useTanks, useInvalidateOperational } from '../query/hooks.js';
import { Calendar, Plus, ShoppingCart, Info, Settings, Edit, Truck, Building } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { PurchaseEntryForm } from './transactions/PurchaseEntryForm.js';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierPaymentSchema } from '@pump/shared';

const transactionService = new CloudTransactionService();

interface PurchasesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'registry';

export const PurchasesList: React.FC<PurchasesListProps> = ({ selectedStation, defaultShiftId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');

  const stationId = selectedStation?.id ?? null;
  const purchasesQ = usePurchases();
  const statusQ = useShiftStatus(stationId, true);
  const suppliersActiveQ = useSuppliers(true);
  const suppliersAllQ = useSuppliers(false);
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const invalidateOperational = useInvalidateOperational();

  const purchases = purchasesQ.data ?? [];
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const suppliers = suppliersActiveQ.data ?? [];
  const allSuppliers = suppliersAllQ.data ?? [];
  const products = productsQ.data ?? [];
  const tanks = tanksQ.data ?? [];

  const loading = purchasesQ.isLoading || statusQ.isLoading || suppliersActiveQ.isLoading || productsQ.isLoading;
  const error = (purchasesQ.error || statusQ.error || suppliersActiveQ.error) as Error | null;

  const [targetShiftId, setTargetShiftId] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Purchase Form States
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);
  const isFuel = selectedProduct?.productType === 'FUEL';
  const productTanks = tanks.filter((t) => t.productId === productId);

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId) {
      const matchesActive = active?.id === defaultShiftId;
      const matchesClosed = closedList.some((shift) => shift.id === defaultShiftId);

      if (matchesActive || matchesClosed) {
        return defaultShiftId;
      }
    }

    if (active) {
      return active.id;
    }

    if (closedList.length > 0) {
      return closedList[0].id;
    }

    return '';
  };

  const resetPurchaseForm = () => {
    setFormError(null);
    setTargetShiftId(resolvePreferredShiftId(activeShift, recentClosedShifts));
    setSupplierId(suppliers[0]?.id ?? '');
    setProductId(products[0]?.id ?? '');
    setQuantity('');
    setTotalAmount('');
    setInvoiceNumber('');
    setNotes('');
    setAllocations({});
  };

  const openPurchaseDrawer = () => {
    resetPurchaseForm();
    setIsPurchaseDrawerOpen(true);
  };

  const closePurchaseDrawer = () => {
    setIsPurchaseDrawerOpen(false);
    resetPurchaseForm();
  };

  useEffect(() => {
    if (isFuel && productTanks.length === 1 && quantity) {
      setAllocations({ [productTanks[0].id]: quantity });
    } else {
      setAllocations({});
    }
  }, [productId, quantity, tanks]);

  // CRUD Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPurchaseDrawerOpen, setIsPurchaseDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null); // null = Creating, object = Editing

  // Supplier Ledger Drawer States
  const [selectedLedgerSupplier, setSelectedLedgerSupplier] = useState<any | null>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Supplier Payment Form hook
  const {
    register: registerPay,
    handleSubmit: handleSubmitPay,
    reset: resetPay,
    setValue: setValuePay,
    formState: { errors: payErrors }
  } = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      shiftId: '',
      supplierId: '',
      amount: '' as any,
      notes: '',
    }
  });

  const openLedgerDrawer = async (sup: any) => {
    setSelectedLedgerSupplier(sup);
    setLedgerTransactions([]);
    setLoadingLedger(true);
    setLedgerError(null);
    setPaymentError(null);
    resetPay({
      shiftId: activeShift?.id || (recentClosedShifts.length > 0 ? recentClosedShifts[0].id : ''),
      supplierId: sup.id,
      amount: '' as any,
      notes: '',
    });
    try {
      const data = await transactionService.getSupplierLedger(sup.id);
      setLedgerTransactions(data || []);
    } catch (err: any) {
      setLedgerError(err.message || 'Failed to load ledger history');
    } finally {
      setLoadingLedger(false);
    }
  };

  const onAddSupplierPayment = async (data: any) => {
    setPaymentError(null);
    try {
      setPaymentSubmitting(true);
      await transactionService.recordSupplierPayment({
        shiftId: data.shiftId,
        supplierId: data.supplierId,
        amount: Number(data.amount),
        notes: data.notes || undefined,
      });

      resetPay({
        shiftId: activeShift?.id || (recentClosedShifts.length > 0 ? recentClosedShifts[0].id : ''),
        supplierId: data.supplierId,
        amount: '' as any,
        notes: '',
      });

      const updatedLedger = await transactionService.getSupplierLedger(data.supplierId);
      setLedgerTransactions(updatedLedger || []);
      invalidateOperational(stationId);
    } catch (err: any) {
      setPaymentError(err.message || 'Failed to record supplier payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Drawer Form Fields
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supIsActive, setSupIsActive] = useState(true);
  const [supGstin, setSupGstin] = useState('');
  const [supPan, setSupPan] = useState('');
  const [supTradeName, setSupTradeName] = useState('');
  const [supBillingAddress, setSupBillingAddress] = useState('');
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Initialise form defaults from query data once it loads (preserves prior
  // load-time behaviour now that data comes from the query cache).
  useEffect(() => {
    setTargetShiftId((prev) => prev || resolvePreferredShiftId(activeShift, recentClosedShifts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.data]);
  useEffect(() => {
    setSupplierId((prev) => prev || suppliers[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliersActiveQ.data]);
  useEffect(() => {
    setProductId((prev) => prev || products[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQ.data]);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!targetShiftId || !supplierId || !productId || !quantity || !totalAmount) return;

    try {
      setSubmitting(true);
      const qtyNum = Number(quantity);
      const totalAmtNum = Number(totalAmount);
      const computedUnitPrice = qtyNum > 0 ? parseFloat((totalAmtNum / qtyNum).toFixed(6)) : 0;

      // Fuel split drop validation
      let tankAllocations: { tankId: string; quantity: number }[] = [];
      if (isFuel && productTanks.length > 0) {
        let totalAllocated = 0;
        for (const tank of productTanks) {
          const qty = Number(allocations[tank.id] || 0);
          if (qty > 0) {
            tankAllocations.push({ tankId: tank.id, quantity: qty });
            totalAllocated += qty;
          }
        }

        if (Math.abs(totalAllocated - qtyNum) >= 0.01) {
          setFormError(`Total allocated volume (${totalAllocated.toFixed(2)}L) must match the total invoice quantity (${qtyNum.toFixed(2)}L)`);
          setSubmitting(false);
          return;
        }
      }

      await transactionService.recordPurchase({
        shiftId: targetShiftId,
        supplierId,
        productId,
        quantity: qtyNum,
        unitPrice: computedUnitPrice,
        invoiceNumber: invoiceNumber || undefined,
        notes: notes || undefined,
        tankAllocations: tankAllocations.length > 0 ? tankAllocations : undefined,
      });

      closePurchaseDrawer();
      invalidateOperational(stationId);
    } catch (err: any) {
      setFormError(err.message || 'Failed to record supplier purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupPhone('');
    setSupIsActive(true);
    setSupGstin('');
    setSupPan('');
    setSupTradeName('');
    setSupBillingAddress('');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (sup: any) => {
    setEditingSupplier(sup);
    setSupName(sup.name);
    setSupPhone(sup.phone || '');
    setSupIsActive(sup.isActive);
    const meta = sup.metadata || {};
    setSupGstin(meta.gstin || '');
    setSupPan(meta.pan || '');
    setSupTradeName(meta.tradeName || '');
    setSupBillingAddress(meta.billingAddress || '');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);
    if (!supName) {
      setDrawerError('Name is required');
      return;
    }

    try {
      setDrawerSubmitting(true);
      const payload = {
        name: supName,
        phone: supPhone || null,
        isActive: supIsActive,
        metadata: {
          gstin: supGstin || null,
          pan: supPan || null,
          tradeName: supTradeName || null,
          billingAddress: supBillingAddress || null,
        }
      };

      if (editingSupplier) {
        await transactionService.updateSupplier(editingSupplier.id, payload);
      } else {
        await transactionService.createSupplier(payload);
      }

      setIsDrawerOpen(false);
      invalidateOperational(stationId);
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save supplier');
    } finally {
      setDrawerSubmitting(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view purchases.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Loading supplier registries..." />;
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontFamily: 'var(--font-sans)' }}>
        <strong>Error:</strong> {error.message || 'Failed to load purchases data'}
      </div>
    );
  }

  const shiftOptions = [
    ...(activeShift ? [{ id: activeShift.id, label: `Active: ${activeShift.templateName} (Open)` }] : []),
    ...recentClosedShifts.map((s) => ({
      id: s.id,
      label: `Closed: ${s.templateName} (${new Date(s.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`,
    })),
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Supplier Purchases
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Record product inventory purchases, fuel tanker drops, and manage supplier accounts.
          </p>
        </div>

        {activeTab === 'transactions' && (
          <button
            onClick={() => openPurchaseDrawer()}
            disabled={!targetShiftId}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: targetShiftId ? 'var(--brand-primary)' : 'var(--border-strong)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: targetShiftId ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={14} /> Add Purchase
          </button>
        )}
        {activeTab === 'registry' && (
          <button
            onClick={openCreateDrawer}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: 'var(--brand-primary)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add Supplier
          </button>
        )}
      </div>

      {/* Tabs Menu */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-soft)',
        gap: '24px',
      }}>
        <button
          onClick={() => setActiveTab('transactions')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'transactions' ? 600 : 500,
            color: activeTab === 'transactions' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'transactions' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShoppingCart size={16} />
          Intakes & Drops
        </button>

        <button
          onClick={() => setActiveTab('registry')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'registry' ? 600 : 500,
            color: activeTab === 'registry' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'registry' ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Settings size={16} />
          Supplier Registry
        </button>
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {targetShiftId ? (
              <div style={{
                backgroundColor: 'var(--state-info-bg)',
                color: 'var(--state-info-fg)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-card)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border-soft)'
              }}>
                <Info size={14} />
                <span>
                  Purchase entries will post to{' '}
                  <strong>
                    {targetShiftId === activeShift?.id
                      ? `${activeShift?.templateName} (Active)`
                      : recentClosedShifts.find((shift) => shift.id === targetShiftId)?.templateName ?? 'selected shift'}
                  </strong>
                  {defaultShiftId === targetShiftId ? ' from the current context.' : '.'}
                </span>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'var(--state-warning-bg)',
                color: 'var(--state-warning-fg)',
                padding: '16px',
                borderRadius: 'var(--radius-card)',
                fontSize: '13px',
                border: '1px solid var(--border-soft)',
                lineHeight: '1.5'
              }}>
                <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Shift Gated Action</span>
                Supplier purchases and tanker drops must belong to an active shift. Please open a shift first.
              </div>
            )}

            <div style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  Fuel Intake Registry
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Total Invoices: <strong>{purchases.length}</strong>
                </span>
              </div>

              {purchases.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No purchases logged yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 20px', fontWeight: 600 }}>Shift Date</th>
                        <th style={{ padding: '10px 20px', fontWeight: 600 }}>Supplier</th>
                        <th style={{ padding: '10px 20px', fontWeight: 600 }}>Reference</th>
                        <th style={{ padding: '10px 20px', fontWeight: 600 }}>Invoice</th>
                        <th style={{ padding: '10px 20px', fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                              {new Date(p.shiftDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                            </div>
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                            {p.supplierName}
                          </td>
                          <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
                            {p.documentNumber}
                          </td>
                          <td style={{ padding: '12px 20px', color: 'var(--text-strong)' }}>
                            {p.invoiceNumber || '--'}
                          </td>
                          <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                            {p.notes || '--'}
                          </td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                            ₹{Number(p.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'registry' && (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Supplier Name</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Outstanding Balance</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No suppliers registered.
                    </td>
                  </tr>
                ) : (
                  allSuppliers.map((sup) => (
                    <tr key={sup.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building size={14} style={{ color: 'var(--text-muted)' }} />
                          <div>
                            <button
                              type="button"
                              onClick={() => openLedgerDrawer(sup)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: 'var(--brand-primary)',
                                fontWeight: 600,
                                textAlign: 'left',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              {sup.name}
                            </button>
                            {sup.metadata?.tradeName && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{sup.metadata.tradeName}</div>
                            )}
                            {sup.metadata?.gstin && (
                              <div style={{ fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN: {sup.metadata.gstin}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                        {sup.phone || '-'}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: sup.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                          color: sup.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-chip)'
                        }}>
                          {sup.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: Number(sup.currentBalance || 0) > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                        ₹{Number(sup.currentBalance || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        <button
                          onClick={() => openEditDrawer(sup)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: '4px',
                          }}
                        >
                          <Edit size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Purchase Entry Drawer */}
      <Drawer
        isOpen={isPurchaseDrawerOpen}
        onClose={closePurchaseDrawer}
        title="Log Supplier Fuel Intake"
      >
        {targetShiftId ? (
          <PurchaseEntryForm
            shiftOptions={shiftOptions}
            targetShiftId={targetShiftId}
            onTargetShiftIdChange={setTargetShiftId}
            supplierId={supplierId}
            onSupplierIdChange={setSupplierId}
            suppliers={suppliers}
            productId={productId}
            onProductIdChange={setProductId}
            products={products}
            quantity={quantity}
            onQuantityChange={setQuantity}
            totalAmount={totalAmount}
            onTotalAmountChange={setTotalAmount}
            invoiceNumber={invoiceNumber}
            onInvoiceNumberChange={setInvoiceNumber}
            notes={notes}
            onNotesChange={setNotes}
            isFuel={isFuel}
            productTanks={productTanks}
            allocations={allocations}
            onAllocationsChange={setAllocations}
            submitting={submitting}
            error={formError}
            onCancel={closePurchaseDrawer}
            onSubmit={handleAddPurchase}
            submitLabel="Record Intake"
            submittingLabel="Recording..."
            submitDisabled={submitting || !quantity || !totalAmount || !supplierId}
            quantityLabel="Volume (Liters)"
            totalAmountLabel="Total Amount (₹)"
            productLabel="Product / Fuel Type"
            invoiceLabel="Invoice Number / Reference"
            invoicePlaceholder="e.g. INV-10022"
            notesPlaceholder="e.g. Tanker drop into Tank A"
          />
        ) : (
          <div style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '16px',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px',
            border: '1px solid var(--border-soft)',
            lineHeight: '1.5'
          }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Shift Gated Action</span>
            Supplier purchases and tanker drops must belong to an active shift. Please open a shift first.
          </div>
        )}
      </Drawer>

      {/* CRUD Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingSupplier ? 'Edit Supplier Profile' : 'Register New Supplier'}
      >
        <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {drawerError && (
            <div style={{
              backgroundColor: 'var(--state-danger-bg)',
              color: 'var(--state-danger-fg)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              border: '1px solid var(--border-soft)'
            }}>
              {drawerError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Supplier Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Bharat Petroleum Corporation Ltd"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              disabled={drawerSubmitting}
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
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number</label>
            <input
              type="text"
              placeholder="e.g. +91 9876..."
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              disabled={drawerSubmitting}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* GST / B2B Section */}
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '12px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
              GST & Tax Registration (Optional B2B)
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>GSTIN</label>
                <input
                  type="text"
                  placeholder="15-digit GSTIN"
                  value={supGstin}
                  onChange={(e) => setSupGstin(e.target.value.toUpperCase())}
                  disabled={drawerSubmitting}
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
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>PAN</label>
                <input
                  type="text"
                  placeholder="10-digit PAN"
                  value={supPan}
                  onChange={(e) => setSupPan(e.target.value.toUpperCase())}
                  disabled={drawerSubmitting}
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
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Trade Name</label>
              <input
                type="text"
                placeholder="Business Trade Name"
                value={supTradeName}
                onChange={(e) => setSupTradeName(e.target.value)}
                disabled={drawerSubmitting}
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
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Billing Address</label>
              <textarea
                placeholder="Full Billing Address"
                value={supBillingAddress}
                onChange={(e) => setSupBillingAddress(e.target.value)}
                disabled={drawerSubmitting}
                rows={2}
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              type="checkbox"
              id="supIsActive"
              checked={supIsActive}
              onChange={(e) => setSupIsActive(e.target.checked)}
              disabled={drawerSubmitting}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="supIsActive" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
              Supplier Active (Clear for purchase drops)
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="submit"
              disabled={drawerSubmitting}
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: 'var(--brand-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {drawerSubmitting ? 'Saving...' : 'Save Supplier'}
            </button>
            
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              disabled={drawerSubmitting}
              style={{
                flex: 1,
                height: '32px',
                backgroundColor: 'var(--bg-surface-alt)',
                color: 'var(--text-default)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Drawer>

      {/* Supplier Ledger Drawer */}
      <Drawer
        isOpen={selectedLedgerSupplier !== null}
        onClose={() => setSelectedLedgerSupplier(null)}
        title="Supplier Account Statement"
      >
        {selectedLedgerSupplier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-sans)', maxHeight: '90vh', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Supplier Summary Card */}
            <div style={{
              backgroundColor: 'var(--bg-surface-alt)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
                    {selectedLedgerSupplier.name}
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: selectedLedgerSupplier.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                    color: selectedLedgerSupplier.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-block',
                    marginTop: '4px'
                  }}>
                    {selectedLedgerSupplier.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Owed Balance</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: selectedLedgerSupplier.currentBalance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)'
                  }}>
                    ₹{Number(selectedLedgerSupplier.currentBalance || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {(selectedLedgerSupplier.metadata?.gstin || selectedLedgerSupplier.metadata?.pan || selectedLedgerSupplier.metadata?.billingAddress) && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                  {selectedLedgerSupplier.metadata?.gstin && <div><strong>GSTIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerSupplier.metadata.gstin}</span></div>}
                  {selectedLedgerSupplier.metadata?.pan && <div><strong>PAN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerSupplier.metadata.pan}</span></div>}
                  {selectedLedgerSupplier.metadata?.billingAddress && <div><strong>Billing Address:</strong> {selectedLedgerSupplier.metadata.billingAddress}</div>}
                </div>
              )}
            </div>

            {/* Quick Supplier Payment Form */}
            <div style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
                Record Supplier Payment
              </h4>

              {paymentError && (
                <div style={{
                  backgroundColor: 'var(--state-danger-bg)',
                  color: 'var(--state-danger-fg)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '12px',
                  border: '1px solid var(--border-soft)'
                }}>
                  {paymentError}
                </div>
              )}

              {activeShift || recentClosedShifts.length > 0 ? (
                <form onSubmit={handleSubmitPay(onAddSupplierPayment)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input type="hidden" {...registerPay('supplierId')} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
                    <select
                      {...registerPay('shiftId')}
                      style={{
                        height: '28px',
                        padding: '0 6px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg-surface)'
                      }}
                    >
                      {activeShift && (
                        <option value={activeShift.id}>Active: {activeShift.templateName} (Open)</option>
                      )}
                      {recentClosedShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          Closed: {s.templateName} ({new Date(s.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Payment Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      {...registerPay('amount', { valueAsNumber: true })}
                      disabled={paymentSubmitting}
                      required
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '12px',
                      }}
                    />
                    {payErrors.amount && (
                      <span style={{ color: 'var(--state-danger-fg)', fontSize: '10px' }}>
                        {payErrors.amount.message}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Payment Ref / Notes</label>
                    <input
                      type="text"
                      placeholder="Cheque, RTGS ref..."
                      {...registerPay('notes')}
                      disabled={paymentSubmitting}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '12px',
                      }}
                    />
                    {payErrors.notes && (
                      <span style={{ color: 'var(--state-danger-fg)', fontSize: '10px' }}>
                        {payErrors.notes.message}
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={paymentSubmitting}
                    style={{
                      height: '30px',
                      backgroundColor: 'var(--brand-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: paymentSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      marginTop: '4px'
                    }}
                  >
                    <Plus size={12} /> {paymentSubmitting ? 'Recording...' : 'Log Supplier Payment'}
                  </button>
                </form>
              ) : (
                <div style={{
                  backgroundColor: 'var(--state-warning-bg)',
                  color: 'var(--state-warning-fg)',
                  padding: '12px',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '11px',
                  border: '1px solid var(--border-soft)'
                }}>
                  Supplier payments must be recorded under a shift. Please open a shift first.
                </div>
              )}
            </div>

            {/* Supplier Ledger Timeline */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>
                Ledger Statements
              </h4>

              {loadingLedger ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Loading ledger transactions...
                </div>
              ) : ledgerError ? (
                <div style={{ padding: '12px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
                  {ledgerError}
                </div>
              ) : ledgerTransactions.length === 0 ? (
                <div style={{ padding: '24px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No transaction ledger events found.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Date / Shift</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Type</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Owed Bal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let running = 0;
                        const sorted = [...ledgerTransactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                        const enriched = sorted.map(tx => {
                          const amt = Number(tx.amount);
                          if (tx.transactionType === 'Purchase' || tx.transactionType === 'Adjustment') {
                            running += amt;
                          } else if (tx.transactionType === 'Payment') {
                            running -= amt;
                          }
                          return { ...tx, runningBalance: running };
                        });
                        return [...enriched].reverse().map((tx) => {
                          const amt = Number(tx.amount);
                          const isPurchase = tx.transactionType === 'Purchase';
                          return (
                            <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                                  {new Date(tx.shiftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  {tx.shiftName}
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{
                                  fontWeight: 600,
                                  color: isPurchase ? 'var(--brand-warning)' : 'var(--state-success-fg)'
                                }}>
                                  {tx.transactionType}
                                </span>
                                {tx.notes && (
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {tx.notes}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: isPurchase ? 'var(--text-strong)' : 'var(--state-success-fg)' }}>
                                {isPurchase ? '' : '-' }₹{amt.toLocaleString('en-IN')}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                                ₹{tx.runningBalance.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedLedgerSupplier(null)}
              style={{
                height: '32px',
                width: '100%',
                backgroundColor: 'var(--bg-surface-alt)',
                color: 'var(--text-default)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '8px',
                marginBottom: '16px'
              }}
            >
              Close Statement
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

