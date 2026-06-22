import React, { useEffect, useState } from 'react';
import { CloudTransactionService, CloudShiftService, CloudProductService } from '../services/cloud.js';
import { Calendar, Plus, ShoppingCart, Info, Settings, Edit, Truck, Building } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';

const transactionService = new CloudTransactionService();
const shiftService = new CloudShiftService();
const productService = new CloudProductService();

interface PurchasesListProps {
  selectedStation: any | null;
}

type TabType = 'transactions' | 'registry';

export const PurchasesList: React.FC<PurchasesListProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Purchases Data
  const [purchases, setPurchases] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [recentClosedShifts, setRecentClosedShifts] = useState<any[]>([]);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]); // Active only for purchases dropdown
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]); // All suppliers for registry
  const [products, setProducts] = useState<any[]>([]);

  // Purchase Form States
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // CRUD Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null); // null = Creating, object = Editing
  
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

  useEffect(() => {
    if (selectedStation) {
      loadData();
    }
  }, [selectedStation]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [list, status, activeSups, allSups, prods] = await Promise.all([
        transactionService.getPurchases(),
        shiftService.getShiftStatus(selectedStation.id, true),
        transactionService.getSuppliers(true),
        transactionService.getSuppliers(false),
        productService.listProducts(),
      ]);

      setPurchases(list || []);
      const active = status.activeShift || null;
      const closedList = status.recentClosedShifts || [];
      setActiveShift(active);
      setRecentClosedShifts(closedList);
      setSuppliers(activeSups || []);
      setAllSuppliers(allSups || []);
      setProducts(prods || []);
 
      if (activeSups && activeSups.length > 0) {
        setSupplierId(activeSups[0].id);
      } else {
        setSupplierId('');
      }
 
      if (prods && prods.length > 0) {
        setProductId(prods[0].id);
      } else {
        setProductId('');
      }
 
      if (active) {
        setTargetShiftId(active.id);
      } else if (closedList.length > 0) {
        setTargetShiftId(closedList[0].id);
      } else {
        setTargetShiftId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load purchases data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!targetShiftId || !supplierId || !productId || !quantity || !totalAmount) return;

    try {
      setSubmitting(true);
      const qtyNum = Number(quantity);
      const totalAmtNum = Number(totalAmount);
      const computedUnitPrice = qtyNum > 0 ? parseFloat((totalAmtNum / qtyNum).toFixed(6)) : 0;

      await transactionService.recordPurchase({
        shiftId: targetShiftId,
        supplierId,
        productId,
        quantity: qtyNum,
        unitPrice: computedUnitPrice,
        invoiceNumber: invoiceNumber || undefined,
        notes: notes || undefined,
      });

      // Clear Form & Reload
      setQuantity('');
      setTotalAmount('');
      setInvoiceNumber('');
      setNotes('');

      const updatedList = await transactionService.getPurchases();
      setPurchases(updatedList || []);
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
      await loadData();
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
        <strong>Error:</strong> {error}
      </div>
    );
  }

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'start' }}>
            {/* Left Column: Form Gated by Shift */}
            <div style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                Log Supplier Fuel Intake
              </h3>

              {formError && (
                <div style={{
                  backgroundColor: 'var(--state-danger-bg)',
                  color: 'var(--state-danger-fg)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '12px',
                  border: '1px solid var(--border-soft)'
                }}>
                  {formError}
                </div>
              )}

              {targetShiftId ? (
                <form onSubmit={handleAddPurchase} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(activeShift && recentClosedShifts.length > 0) || recentClosedShifts.length > 1 ? (
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
                      <select
                        value={targetShiftId}
                        onChange={(e) => setTargetShiftId(e.target.value)}
                        style={{
                          height: '32px',
                          padding: '0 8px',
                          borderRadius: 'var(--radius-input)',
                          border: '1px solid var(--border-strong)',
                          fontSize: '13px',
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
                  ) : (
                    <div style={{
                      backgroundColor: 'var(--state-info-bg)',
                      color: 'var(--state-info-fg)',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-input)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Info size={14} />
                      <span>
                        Logging to {activeShift ? 'active' : 'previous closed'} shift:{' '}
                        <strong>{activeShift ? activeShift.templateName : recentClosedShifts[0]?.templateName}</strong>
                      </span>
                    </div>
                  )}

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Supplier</label>
                    {suppliers.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--brand-warning)', padding: '6px 0' }}>
                        No active suppliers found. Please add or enable suppliers in the Supplier Registry tab.
                      </div>
                    ) : (
                      <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        disabled={submitting}
                        style={{
                          height: '32px',
                          padding: '0 8px',
                          borderRadius: 'var(--radius-input)',
                          border: '1px solid var(--border-strong)',
                          fontSize: '13px',
                          backgroundColor: 'var(--bg-surface)'
                        }}
                      >
                        {suppliers.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name} {sup.metadata?.gstin ? `(${sup.metadata.gstin})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Product / Fuel Type</label>
                    <select
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      disabled={submitting}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '13px',
                        backgroundColor: 'var(--bg-surface)'
                      }}
                    >
                      {products.map((prod) => (
                        <option key={prod.id} value={prod.id}>{prod.name} ({prod.code})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Volume (Liters)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        disabled={submitting}
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
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Amount (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        disabled={submitting}
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

                  {parseFloat(quantity) > 0 && parseFloat(totalAmount) > 0 && (
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-surface-alt)',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      <span>Derived Price per Litre:</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        ₹{(parseFloat(totalAmount) / parseFloat(quantity)).toFixed(4)}/L
                      </span>
                    </div>
                  )}

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Invoice Number / Reference</label>
                    <input
                      type="text"
                      placeholder="e.g. INV-10022"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      disabled={submitting}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Tanker drop into Tank A"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={submitting}
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
                    disabled={submitting || !quantity || !totalAmount || !supplierId}
                    style={{
                      height: '36px',
                      backgroundColor: 'var(--brand-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: (submitting || !supplierId) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginTop: '8px'
                    }}
                  >
                    <Plus size={14} /> {submitting ? 'Recording...' : 'Record Intake'}
                  </button>
                </form>
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
            </div>

            {/* Right Column: Historical Intake Registry */}
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
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                            <div>{sup.name}</div>
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
    </div>
  );
};
