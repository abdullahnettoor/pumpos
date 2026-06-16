import React, { useEffect, useState } from 'react';
import { CloudTransactionService, CloudShiftService } from '../services/cloud.js';
import { User, ShieldAlert, CreditCard, DollarSign, Plus, Info, Edit, Check, Settings, Scale } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';

const transactionService = new CloudTransactionService();
const shiftService = new CloudShiftService();

interface CustomersListProps {
  selectedStation: any | null;
}

type TabType = 'transactions' | 'registry';

export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Customers Data
  const [customers, setCustomers] = useState<any[]>([]); // Active only for transactions dropdown
  const [allCustomers, setAllCustomers] = useState<any[]>([]); // All customers for management
  const [activeShift, setActiveShift] = useState<any | null>(null);

  // Transaction Form States
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Credit'>('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // CRUD Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null); // null = Creating, object = Editing
  
  // Drawer Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custType, setCustType] = useState<'Regular' | 'Credit' | 'Fleet'>('Regular');
  const [custCreditLimit, setCustCreditLimit] = useState('');
  const [custFleetCode, setCustFleetCode] = useState('');
  const [custIsActive, setCustIsActive] = useState(true);
  const [custGstin, setCustGstin] = useState('');
  const [custPan, setCustPan] = useState('');
  const [custTradeName, setCustTradeName] = useState('');
  const [custBillingAddress, setCustBillingAddress] = useState('');
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

      const [activeList, allList, status] = await Promise.all([
        transactionService.getCustomers(true),
        transactionService.getCustomers(false),
        shiftService.getShiftStatus(selectedStation.id, true),
      ]);

      setCustomers(activeList || []);
      setAllCustomers(allList || []);
      setActiveShift(status.activeShift || null);

      if (activeList && activeList.length > 0) {
        setCustomerId(activeList[0].id);
      } else {
        setCustomerId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load customers data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!activeShift || !amount) return;

    if (paymentMethod === 'Credit' && !customerId) {
      setFormError('A customer account must be selected for Credit Fleet Sales.');
      return;
    }

    try {
      setSubmitting(true);
      await transactionService.recordCollection({
        shiftId: activeShift.id,
        customerId: customerId || undefined,
        amount: Number(amount),
        paymentMethod,
        notes: notes || undefined,
      });

      // Clear Form & Reload
      setAmount('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record entry');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingCustomer(null);
    setCustName('');
    setCustPhone('');
    setCustType('Regular');
    setCustCreditLimit('50000');
    setCustFleetCode('');
    setCustIsActive(true);
    setCustGstin('');
    setCustPan('');
    setCustTradeName('');
    setCustBillingAddress('');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (cust: any) => {
    setEditingCustomer(cust);
    setCustName(cust.name);
    setCustPhone(cust.phone || '');
    setCustType(cust.customerType);
    setCustCreditLimit(cust.creditLimit ? String(cust.creditLimit) : '');
    setCustFleetCode(cust.fleetCode || '');
    setCustIsActive(cust.isActive);
    const meta = cust.metadata || {};
    setCustGstin(meta.gstin || '');
    setCustPan(meta.pan || '');
    setCustTradeName(meta.tradeName || '');
    setCustBillingAddress(meta.billingAddress || '');
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);
    if (!custName) {
      setDrawerError('Name is required');
      return;
    }

    try {
      setDrawerSubmitting(true);
      const payload = {
        name: custName,
        phone: custPhone || null,
        customerType: custType,
        creditLimit: (custType === 'Credit' || custType === 'Fleet') && custCreditLimit ? Number(custCreditLimit) : null,
        fleetCode: custType === 'Fleet' ? custFleetCode : null,
        isActive: custIsActive,
        metadata: {
          gstin: custGstin || null,
          pan: custPan || null,
          tradeName: custTradeName || null,
          billingAddress: custBillingAddress || null,
        },
      };

      if (editingCustomer) {
        await transactionService.updateCustomer(editingCustomer.id, payload);
      } else {
        await transactionService.createCustomer(payload);
      }

      setIsDrawerOpen(false);
      await loadData();
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save customer');
    } finally {
      setDrawerSubmitting(false);
    }
  };

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px', fontFamily: 'var(--font-sans)' }}>
        Please select a station to view customer accounts.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Loading customer registries..." />;
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
            Customer Fleet Accounts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Manage fleet customer profiles, credit limits, and record shift collections.
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
            <Plus size={14} /> Add Customer
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
          <CreditCard size={16} />
          Shift Collections & Sales
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
          Customer Registry
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
                Log Credit Transaction / Collection
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

              {activeShift ? (
                <form onSubmit={handleAddCollection} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                    <span>Logging to active shift: <strong>{activeShift.templateName}</strong></span>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Entry Type / Payment Method</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                      {(['Cash', 'Card', 'UPI', 'Credit'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          disabled={submitting}
                          style={{
                            height: '32px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: paymentMethod === method ? 'var(--brand-primary)' : 'var(--bg-surface-alt)',
                            color: paymentMethod === method ? 'white' : 'var(--text-default)',
                            border: paymentMethod === method ? 'none' : '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-input)',
                            cursor: 'pointer',
                          }}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Customer Account {paymentMethod === 'Credit' ? '(Required)' : '(Optional for Walk-in)'}
                    </label>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      disabled={submitting}
                      style={{
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '13px',
                      }}
                    >
                      <option value="">-- Walk-in / Cash Customer --</option>
                      {customers.map((cust) => (
                        <option key={cust.id} value={cust.id}>{cust.name} ({cust.customerType})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
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
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Notes / Fleet Slip ID</label>
                    <input
                      type="text"
                      placeholder="Slip code, transaction ref..."
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
                    disabled={submitting || !amount}
                    style={{
                      height: '36px',
                      backgroundColor: 'var(--brand-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginTop: '8px'
                    }}
                  >
                    <Plus size={14} /> {submitting ? 'Recording...' : paymentMethod === 'Credit' ? 'Log Credit Sale' : 'Log Collection'}
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
                  Collections and credit fleet sales must be logged during an active shift. Please open a shift first.
                </div>
              )}
            </div>

            {/* Right Column: Mini Table */}
            <div style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  Active Credit Accounts Summary
                </h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Outstanding Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, idx) => {
                    const balance = Number(c.currentBalance || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>{c.name}</td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{c.customerType}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                          ₹{balance.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Customer Name</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Account Type</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Credit Limit</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Fleet Code</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Outstanding Balance</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No customers registered.
                    </td>
                  </tr>
                ) : (
                  allCustomers.map((c) => {
                    const balance = Number(c.currentBalance || 0);
                    const limit = Number(c.creditLimit || 0);
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={14} style={{ color: 'var(--text-muted)' }} />
                            <div>
                              <div>{c.name}</div>
                              {c.metadata?.tradeName && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{c.metadata.tradeName}</div>
                              )}
                              {c.metadata?.gstin && (
                                <div style={{ fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN: {c.metadata.gstin}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: c.customerType === 'Fleet' ? 'var(--state-info-bg)' : c.customerType === 'Credit' ? 'var(--state-warning-bg)' : 'var(--bg-surface-alt)',
                            color: c.customerType === 'Fleet' ? 'var(--state-info-fg)' : c.customerType === 'Credit' ? 'var(--state-warning-fg)' : 'var(--text-strong)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-chip)'
                          }}>
                            {c.customerType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                          {c.phone || '-'}
                        </td>
                        <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {limit > 0 ? `₹${limit.toLocaleString('en-IN')}` : 'N/A'}
                        </td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                          {c.fleetCode || '-'}
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: c.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                            color: c.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-chip)'
                          }}>
                            {c.isActive ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                          ₹{balance.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          <button
                            onClick={() => openEditDrawer(c)}
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
                    );
                  })
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
        title={editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}
      >
        <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Customer Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. KSRTC Depo, John Doe"
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
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
              placeholder="e.g. +91 9900..."
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
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
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Account Type *</label>
            <select
              value={custType}
              onChange={(e) => setCustType(e.target.value as any)}
              disabled={drawerSubmitting}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
            >
              <option value="Regular">Regular (Cash/Card/UPI walk-in)</option>
              <option value="Credit">Credit (Standard outstanding account)</option>
              <option value="Fleet">Fleet (Requires fleet code authorization)</option>
            </select>
          </div>

          {(custType === 'Credit' || custType === 'Fleet') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Credit Limit (₹)</label>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={custCreditLimit}
                onChange={(e) => setCustCreditLimit(e.target.value)}
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
          )}

          {custType === 'Fleet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Fleet Code / Card Reference</label>
              <input
                type="text"
                placeholder="e.g. FL-9923"
                value={custFleetCode}
                onChange={(e) => setCustFleetCode(e.target.value)}
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
          )}

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
                  value={custGstin}
                  onChange={(e) => setCustGstin(e.target.value.toUpperCase())}
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
                  value={custPan}
                  onChange={(e) => setCustPan(e.target.value.toUpperCase())}
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
                value={custTradeName}
                onChange={(e) => setCustTradeName(e.target.value)}
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
                value={custBillingAddress}
                onChange={(e) => setCustBillingAddress(e.target.value)}
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
              id="custIsActive"
              checked={custIsActive}
              onChange={(e) => setCustIsActive(e.target.checked)}
              disabled={drawerSubmitting}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="custIsActive" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
              Account Active (Clear for operational logging)
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
              {drawerSubmitting ? 'Saving...' : 'Save Customer'}
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
