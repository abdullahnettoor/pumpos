import React, { useEffect, useState } from 'react';
import { CloudTransactionService, CloudShiftService, CloudProductService } from '../services/cloud.js';
import { User, ShieldAlert, CreditCard, DollarSign, Plus, Info, Edit, Check, Settings, Scale, Truck, Trash2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { CollectionEntryForm } from './transactions/CollectionEntryForm.js';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerCreateSchema } from '@pump/shared';

const transactionService = new CloudTransactionService();
const shiftService = new CloudShiftService();
const productService = new CloudProductService();

interface CustomersListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'registry' | 'vehicles';

export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation, defaultShiftId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Customers Data
  const [customers, setCustomers] = useState<any[]>([]); // Active only for transactions dropdown
  const [allCustomers, setAllCustomers] = useState<any[]>([]); // All customers for management
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [recentClosedShifts, setRecentClosedShifts] = useState<any[]>([]);

  // CRUD Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCollectionDrawerOpen, setIsCollectionDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null); // null = Creating, object = Editing
  
  // Ledger Drawer States
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState<any | null>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const openLedgerDrawer = async (cust: any) => {
    setSelectedLedgerCustomer(cust);
    setLedgerTransactions([]);
    setLoadingLedger(true);
    setLedgerError(null);
    try {
      const data = await transactionService.getCustomerLedger(cust.id);
      setLedgerTransactions(data || []);
    } catch (err: any) {
      setLedgerError(err.message || 'Failed to load ledger history');
    } finally {
      setLoadingLedger(false);
    }
  };

  const [formError, setFormError] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [collectionShiftId, setCollectionShiftId] = useState('');
  const [collectionCustomerId, setCollectionCustomerId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionPaymentMethod, setCollectionPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Credit'>('Cash');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  // Vehicles tab state
  const [fuelProducts, setFuelProducts] = useState<any[]>([]);
  const [vehicleCustomerId, setVehicleCustomerId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    customerId: '',
    registrationNumber: '',
    vehicleType: '',
    defaultProductId: '',
    isActive: true,
  });
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);

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

  const resetCollectionForm = () => {
    const preferredShiftId = resolvePreferredShiftId(activeShift, recentClosedShifts);
    setCollectionShiftId(preferredShiftId);
    setCollectionCustomerId(customers[0]?.id || '');
    setCollectionAmount('');
    setCollectionPaymentMethod('Cash');
    setCollectionNotes('');
    setCollectionSubmitting(false);
    setFormError(null);
  };

  const openCollectionDrawer = () => {
    resetCollectionForm();
    setIsCollectionDrawerOpen(true);
  };

  const closeCollectionDrawer = () => {
    setIsCollectionDrawerOpen(false);
    resetCollectionForm();
  };

  // 2. Customer Drawer Form (Create/Edit)
  const {
    register: registerCust,
    handleSubmit: handleSubmitCust,
    setValue: setValueCust,
    watch: watchCust,
    reset: resetCust,
    formState: { errors: custErrors, isSubmitting: drawerSubmitting }
  } = useForm({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name: '',
      phone: '',
      customerType: 'Regular' as const,
      creditLimit: 50000 as any,
      fleetCode: '',
      isActive: true,
      metadata: {
        gstin: '',
        pan: '',
        tradeName: '',
        billingAddress: '',
      }
    }
  });

  const custType = watchCust('customerType');

  useEffect(() => {
    if (selectedStation) {
      loadData();
    }
  }, [selectedStation]);

  useEffect(() => {
    if (activeTab === 'vehicles' && vehicleCustomerId) {
      loadVehicles(vehicleCustomerId);
    }
  }, [activeTab, vehicleCustomerId]);

  useEffect(() => {
    setCollectionShiftId(resolvePreferredShiftId(activeShift, recentClosedShifts));
  }, [activeShift, recentClosedShifts, defaultShiftId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [activeList, allList, status, products] = await Promise.all([
        transactionService.getCustomers(true),
        transactionService.getCustomers(false),
        shiftService.getShiftStatus(selectedStation.id, true),
        productService.listProducts(),
      ]);

      setCustomers(activeList || []);
      setAllCustomers(allList || []);
      const active = status.activeShift || null;
      const closedList = status.recentClosedShifts || [];
      setActiveShift(active);
      setRecentClosedShifts(closedList);
      setFuelProducts((products || []).filter((p: any) => p.productType === 'FUEL' && p.isActive));

      const eligibleCustomers = (allList || []).filter((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet');
      if (eligibleCustomers.length > 0) {
        setVehicleCustomerId((prev) => prev || eligibleCustomers[0].id);
      } else {
        setVehicleCustomerId('');
      }

      if (activeList && activeList.length > 0) {
        setCollectionCustomerId(activeList[0].id);
      } else {
        setCollectionCustomerId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load customers data');
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async (customerId: string) => {
    if (!customerId) {
      setVehicles([]);
      return;
    }

    try {
      setLoadingVehicles(true);
      setVehicleError(null);
      const list = await transactionService.getCustomerVehicles(customerId, false);
      setVehicles(list || []);
    } catch (err: any) {
      setVehicleError(err.message || 'Failed to load vehicles');
    } finally {
      setLoadingVehicles(false);
    }
  };

  const openCreateVehicleDrawer = () => {
    setEditingVehicle(null);
    setVehicleForm({
      customerId: vehicleCustomerId,
      registrationNumber: '',
      vehicleType: '',
      defaultProductId: '',
      isActive: true,
    });
    setVehicleError(null);
    setIsVehicleDrawerOpen(true);
  };

  const openEditVehicleDrawer = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setVehicleForm({
      customerId: vehicle.customerId,
      registrationNumber: vehicle.registrationNumber || '',
      vehicleType: vehicle.vehicleType || '',
      defaultProductId: vehicle.defaultProductId || '',
      isActive: vehicle.isActive,
    });
    setVehicleError(null);
    setIsVehicleDrawerOpen(true);
  };

  const onSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setVehicleError(null);

    if (!vehicleForm.customerId || !vehicleForm.registrationNumber || !vehicleForm.vehicleType) {
      setVehicleError('Customer, registration number and vehicle type are required.');
      return;
    }

    try {
      setVehicleSubmitting(true);
      const payload = {
        registrationNumber: vehicleForm.registrationNumber.trim().toUpperCase(),
        vehicleType: vehicleForm.vehicleType.trim(),
        defaultProductId: vehicleForm.defaultProductId || null,
        isActive: vehicleForm.isActive,
      };

      if (editingVehicle) {
        await transactionService.updateCustomerVehicle(editingVehicle.id, payload);
      } else {
        await transactionService.createCustomerVehicle(vehicleForm.customerId, payload);
      }

      setIsVehicleDrawerOpen(false);
      await loadVehicles(vehicleForm.customerId);
    } catch (err: any) {
      setVehicleError(err.message || 'Failed to save vehicle');
    } finally {
      setVehicleSubmitting(false);
    }
  };

  const onDeleteVehicle = async (vehicle: any) => {
    if (!window.confirm(`Delete vehicle ${vehicle.registrationNumber}?`)) {
      return;
    }

    try {
      await transactionService.deleteCustomerVehicle(vehicle.id);
      await loadVehicles(vehicle.customerId);
    } catch (err: any) {
      setVehicleError(err.message || 'Failed to delete vehicle');
    }
  };

  const onAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!collectionShiftId || !collectionAmount) {
      return;
    }

    if (collectionPaymentMethod === 'Credit' && !collectionCustomerId) {
      setFormError('A customer account must be selected for Credit Fleet Sales.');
      return;
    }

    try {
      setCollectionSubmitting(true);
      await transactionService.recordCollection({
        shiftId: collectionShiftId,
        customerId: collectionCustomerId || undefined,
        amount: Number(collectionAmount),
        paymentMethod: collectionPaymentMethod,
        notes: collectionNotes || undefined,
      });

      closeCollectionDrawer();
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record entry');
    } finally {
      setCollectionSubmitting(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingCustomer(null);
    resetCust({
      name: '',
      phone: '',
      customerType: 'Regular',
      creditLimit: 50000 as any,
      fleetCode: '',
      isActive: true,
      metadata: {
        gstin: '',
        pan: '',
        tradeName: '',
        billingAddress: '',
      }
    });
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (cust: any) => {
    setEditingCustomer(cust);
    const meta = cust.metadata || {};
    resetCust({
      name: cust.name,
      phone: cust.phone || '',
      customerType: cust.customerType,
      creditLimit: cust.creditLimit ? Number(cust.creditLimit) : (cust.customerType === 'Regular' ? null : 50000) as any,
      fleetCode: cust.fleetCode || '',
      isActive: cust.isActive,
      metadata: {
        gstin: meta.gstin || '',
        pan: meta.pan || '',
        tradeName: meta.tradeName || '',
        billingAddress: meta.billingAddress || '',
      }
    });
    setDrawerError(null);
    setIsDrawerOpen(true);
  };

  const onSaveCustomer = async (data: any) => {
    setDrawerError(null);
    try {
      const payload = {
        name: data.name,
        phone: data.phone || null,
        customerType: data.customerType,
        creditLimit: (data.customerType === 'Credit' || data.customerType === 'Fleet') && data.creditLimit ? Number(data.creditLimit) : null,
        fleetCode: data.customerType === 'Fleet' ? data.fleetCode : null,
        isActive: data.isActive,
        metadata: {
          gstin: data.metadata?.gstin || null,
          pan: data.metadata?.pan || null,
          tradeName: data.metadata?.tradeName || null,
          billingAddress: data.metadata?.billingAddress || null,
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
        
        {activeTab === 'transactions' && (
          <button
            onClick={() => openCollectionDrawer()}
            disabled={!(activeShift || recentClosedShifts.length > 0)}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: activeShift || recentClosedShifts.length > 0 ? 'var(--brand-primary)' : 'var(--border-strong)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: activeShift || recentClosedShifts.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={14} /> Add Collection
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
            <Plus size={14} /> Add Customer
          </button>
        )}
        {activeTab === 'vehicles' && (
          <button
            onClick={openCreateVehicleDrawer}
            disabled={!vehicleCustomerId}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: vehicleCustomerId ? 'var(--brand-primary)' : 'var(--border-strong)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              cursor: vehicleCustomerId ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={14} /> Add Vehicle
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

        <button
          onClick={() => setActiveTab('vehicles')}
          style={{
            padding: '12px 4px',
            fontSize: '14px',
            fontWeight: activeTab === 'vehicles' ? 600 : 500,
            color: activeTab === 'vehicles' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'vehicles' ? '2px solid var(--primary)' : '2px solid transparent',
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
          <Truck size={16} />
          Vehicles
        </button>
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeShift || recentClosedShifts.length > 0 ? (
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
                  Collections will post to{' '}
                  <strong>
                    {resolvePreferredShiftId(activeShift, recentClosedShifts) === activeShift?.id
                      ? `${activeShift?.templateName} (Active)`
                      : recentClosedShifts.find((shift) => shift.id === resolvePreferredShiftId(activeShift, recentClosedShifts))?.templateName ?? 'selected shift'}
                  </strong>
                  {defaultShiftId === resolvePreferredShiftId(activeShift, recentClosedShifts) ? ' from the current context.' : '.'}
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
                Collections and credit fleet sales must be logged during an active shift. Please open a shift first.
              </div>
            )}

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
                              <button
                                type="button"
                                onClick={() => openLedgerDrawer(c)}
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
                                {c.name}
                              </button>
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
                        <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                          {limit > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>₹{limit.toLocaleString('en-IN')}</span>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border-soft)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.min(100, (balance / limit) * 100)}%`,
                                  height: '100%',
                                  backgroundColor: balance > limit ? 'var(--brand-danger)' : balance >= limit * 0.75 ? 'var(--brand-warning)' : 'var(--brand-primary)'
                                }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                          )}
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
                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: limit > 0 && balance > limit ? 'var(--brand-danger)' : balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
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

        {activeTab === 'vehicles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Credit/Fleet Customer
                </label>
                <select
                  value={vehicleCustomerId}
                  onChange={(e) => setVehicleCustomerId(e.target.value)}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                >
                  {allCustomers
                    .filter((c) => c.customerType === 'Credit' || c.customerType === 'Fleet')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.customerType})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {vehicleError && (
              <div style={{ padding: '12px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontSize: '12px' }}>
                {vehicleError}
              </div>
            )}

            {!vehicleCustomerId ? (
              <div style={{ padding: '16px', backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', borderRadius: 'var(--radius-card)', fontSize: '13px' }}>
                No Credit/Fleet customer found. Create a Credit or Fleet customer first.
              </div>
            ) : loadingVehicles ? (
              <LoadingSpinner text="Loading vehicles..." />
            ) : (
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Registration No.</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Vehicle Type</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Default Product</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No vehicles registered for this customer.
                        </td>
                      </tr>
                    ) : (
                      vehicles.map((v) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                            {v.registrationNumber}
                          </td>
                          <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>{v.vehicleType}</td>
                          <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                            {v.defaultProductName ? `${v.defaultProductName} (${v.defaultProductCode || ''})` : '-'}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: v.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                                color: v.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-chip)',
                              }}
                            >
                              {v.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                            {new Date(v.updatedAt).toLocaleDateString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                            <button
                              onClick={() => openEditVehicleDrawer(v)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                              title="Edit Vehicle"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => onDeleteVehicle(v)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand-danger)', padding: '4px' }}
                              title="Delete Vehicle"
                            >
                              <Trash2 size={14} />
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
        )}
      </div>

      {/* CRUD Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}
      >
        <form onSubmit={handleSubmitCust(onSaveCustomer)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
              placeholder="e.g. KSRTC Depo, John Doe"
              {...registerCust('name')}
              disabled={drawerSubmitting}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
            />
            {custErrors.name && (
              <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                {custErrors.name.message}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number</label>
            <input
              type="text"
              placeholder="e.g. +91 9900..."
              {...registerCust('phone')}
              disabled={drawerSubmitting}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border-strong)',
                fontSize: '13px',
              }}
            />
            {custErrors.phone && (
              <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                {custErrors.phone.message}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Account Type *</label>
            <select
              {...registerCust('customerType')}
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
            {custErrors.customerType && (
              <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                {custErrors.customerType.message}
              </span>
            )}
          </div>

          {(custType === 'Credit' || custType === 'Fleet') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Credit Limit (₹)</label>
              <input
                type="number"
                placeholder="e.g. 50000"
                {...registerCust('creditLimit', { valueAsNumber: true })}
                disabled={drawerSubmitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
              {custErrors.creditLimit && (
                <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                  {custErrors.creditLimit.message}
                </span>
              )}
            </div>
          )}

          {custType === 'Fleet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Fleet Code / Card Reference</label>
              <input
                type="text"
                placeholder="e.g. FL-9923"
                {...registerCust('fleetCode')}
                disabled={drawerSubmitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
              {custErrors.fleetCode && (
                <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                  {custErrors.fleetCode.message}
                </span>
              )}
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
                  {...registerCust('metadata.gstin', {
                    onChange: (e) => setValueCust('metadata.gstin', e.target.value.toUpperCase())
                  })}
                  disabled={drawerSubmitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
                {custErrors.metadata?.gstin && (
                  <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                    {custErrors.metadata.gstin.message}
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>PAN</label>
                <input
                  type="text"
                  placeholder="10-digit PAN"
                  {...registerCust('metadata.pan', {
                    onChange: (e) => setValueCust('metadata.pan', e.target.value.toUpperCase())
                  })}
                  disabled={drawerSubmitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                  }}
                />
                {custErrors.metadata?.pan && (
                  <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                    {custErrors.metadata.pan.message}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Trade Name</label>
              <input
                type="text"
                placeholder="Business Trade Name"
                {...registerCust('metadata.tradeName')}
                disabled={drawerSubmitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
              {custErrors.metadata?.tradeName && (
                <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                  {custErrors.metadata.tradeName.message}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Billing Address</label>
              <textarea
                placeholder="Full Billing Address"
                {...registerCust('metadata.billingAddress')}
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
              {custErrors.metadata?.billingAddress && (
                <span style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                  {custErrors.metadata.billingAddress.message}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              type="checkbox"
              id="custIsActive"
              {...registerCust('isActive')}
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

      {/* Collections Drawer */}
      <Drawer
        isOpen={isCollectionDrawerOpen}
        onClose={closeCollectionDrawer}
        title="Log Credit Transaction / Collection"
      >
        {activeShift || recentClosedShifts.length > 0 ? (
          <CollectionEntryForm
            shiftOptions={[
              ...(activeShift ? [{ id: activeShift.id, label: `Active: ${activeShift.templateName} (Open)` }] : []),
              ...recentClosedShifts.map((s) => ({
                id: s.id,
                label: `Closed: ${s.templateName} (${new Date(s.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`,
              })),
            ]}
            targetShiftId={collectionShiftId}
            onTargetShiftIdChange={setCollectionShiftId}
            customerId={collectionCustomerId}
            onCustomerIdChange={setCollectionCustomerId}
            customers={customers}
            amount={collectionAmount}
            onAmountChange={setCollectionAmount}
            paymentMethod={collectionPaymentMethod}
            onPaymentMethodChange={setCollectionPaymentMethod}
            notes={collectionNotes}
            onNotesChange={setCollectionNotes}
            submitting={collectionSubmitting}
            error={formError}
            onCancel={closeCollectionDrawer}
            onSubmit={onAddCollection}
            submitLabel={collectionPaymentMethod === 'Credit' ? 'Log Credit Sale' : 'Log Collection'}
            submittingLabel="Recording..."
            submitDisabled={collectionSubmitting || !collectionAmount}
            amountLabel="Amount (₹)"
            amountPlaceholder="0.00"
            notesLabel="Notes / Fleet Slip ID"
            notesPlaceholder="Slip code, transaction ref..."
            paymentMethodLabel="Entry Type / Payment Method"
            usePaymentMethodButtons={true}
            walkInOptionLabel="-- Walk-in / Cash Customer --"
            customerOptionLabel={(cust) => `${cust.name} (${cust.customerType})`}
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
            Collections and credit fleet sales must be logged during an active shift. Please open a shift first.
          </div>
        )}
      </Drawer>

      {/* Customer Ledger Drawer */}
      <Drawer
        isOpen={selectedLedgerCustomer !== null}
        onClose={() => setSelectedLedgerCustomer(null)}
        title="Customer Account Statement"
      >
        {selectedLedgerCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'var(--font-sans)' }}>
            {/* Customer Summary Card */}
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
                    {selectedLedgerCustomer.name}
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: selectedLedgerCustomer.customerType === 'Fleet' ? 'var(--state-info-bg)' : selectedLedgerCustomer.customerType === 'Credit' ? 'var(--state-warning-bg)' : 'var(--bg-surface)',
                    color: selectedLedgerCustomer.customerType === 'Fleet' ? 'var(--state-info-fg)' : selectedLedgerCustomer.customerType === 'Credit' ? 'var(--state-warning-fg)' : 'var(--text-strong)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-block',
                    marginTop: '4px'
                  }}>
                    {selectedLedgerCustomer.customerType}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Outstanding Balance</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: selectedLedgerCustomer.creditLimit > 0 && selectedLedgerCustomer.currentBalance > selectedLedgerCustomer.creditLimit ? 'var(--brand-danger)' : selectedLedgerCustomer.currentBalance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)'
                  }}>
                    ₹{Number(selectedLedgerCustomer.currentBalance || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Credit Limit</span>
                  <strong style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    {selectedLedgerCustomer.creditLimit > 0 ? `₹${Number(selectedLedgerCustomer.creditLimit).toLocaleString('en-IN')}` : 'N/A'}
                  </strong>
                </div>
                {selectedLedgerCustomer.creditLimit > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block' }}>Available Credit</span>
                    <strong style={{
                      color: (selectedLedgerCustomer.creditLimit - selectedLedgerCustomer.currentBalance) < 0 ? 'var(--brand-danger)' : 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      ₹{Math.max(0, Number(selectedLedgerCustomer.creditLimit) - Number(selectedLedgerCustomer.currentBalance)).toLocaleString('en-IN')}
                    </strong>
                  </div>
                )}
              </div>

              {(selectedLedgerCustomer.metadata?.gstin || selectedLedgerCustomer.metadata?.pan || selectedLedgerCustomer.metadata?.billingAddress) && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-muted)' }}>
                  {selectedLedgerCustomer.metadata?.gstin && <div><strong>GSTIN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerCustomer.metadata.gstin}</span></div>}
                  {selectedLedgerCustomer.metadata?.pan && <div><strong>PAN:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLedgerCustomer.metadata.pan}</span></div>}
                  {selectedLedgerCustomer.metadata?.billingAddress && <div><strong>Billing Address:</strong> {selectedLedgerCustomer.metadata.billingAddress}</div>}
                </div>
              )}
            </div>

            {/* Ledger Timeline Table */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>
                Statement of Account
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
                  No transaction history found for this account.
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Date / Shift</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Type</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let running = 0;
                        const sorted = [...ledgerTransactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                        const enriched = sorted.map(tx => {
                          const amt = Number(tx.amount);
                          if (tx.transactionType === 'Credit Sale' || tx.transactionType === 'Adjustment') {
                            running += amt;
                          } else if (tx.transactionType === 'Collection') {
                            running -= amt;
                          }
                          return { ...tx, runningBalance: running };
                        });
                        return [...enriched].reverse().map((tx) => {
                          const amt = Number(tx.amount);
                          const isCreditSale = tx.transactionType === 'Credit Sale';
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
                                  color: isCreditSale ? 'var(--brand-warning)' : 'var(--state-success-fg)'
                                }}>
                                  {tx.transactionType}
                                </span>
                                {tx.notes && (
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {tx.notes}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: isCreditSale ? 'var(--text-strong)' : 'var(--state-success-fg)' }}>
                                {isCreditSale ? '' : '-' }₹{amt.toLocaleString('en-IN')}
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
              onClick={() => setSelectedLedgerCustomer(null)}
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
                marginTop: '8px'
              }}
            >
              Close Statement
            </button>
          </div>
        )}
      </Drawer>

      <Drawer
        isOpen={isVehicleDrawerOpen}
        onClose={() => setIsVehicleDrawerOpen(false)}
        title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
      >
        <form onSubmit={onSaveVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {vehicleError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
              {vehicleError}
            </div>
          )}

          {!editingVehicle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Customer *</label>
              <select
                value={vehicleForm.customerId}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, customerId: e.target.value }))}
                disabled={vehicleSubmitting}
                style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
              >
                {allCustomers
                  .filter((c) => c.customerType === 'Credit' || c.customerType === 'Fleet')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerType})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Registration Number *</label>
            <input
              type="text"
              value={vehicleForm.registrationNumber}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, registrationNumber: e.target.value.toUpperCase() }))}
              disabled={vehicleSubmitting}
              placeholder="e.g. KL07AB1234"
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Vehicle Type *</label>
            <input
              type="text"
              value={vehicleForm.vehicleType}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, vehicleType: e.target.value }))}
              disabled={vehicleSubmitting}
              placeholder="e.g. Truck, Bus"
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Default Fuel Product</label>
            <select
              value={vehicleForm.defaultProductId}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, defaultProductId: e.target.value }))}
              disabled={vehicleSubmitting}
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            >
              <option value="">-- Select Product --</option>
              {fuelProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="vehicleIsActive"
              checked={vehicleForm.isActive}
              onChange={(e) => setVehicleForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              disabled={vehicleSubmitting}
            />
            <label htmlFor="vehicleIsActive" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
              Vehicle Active
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={vehicleSubmitting}
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
              {vehicleSubmitting ? 'Saving...' : 'Save Vehicle'}
            </button>

            <button
              type="button"
              onClick={() => setIsVehicleDrawerOpen(false)}
              disabled={vehicleSubmitting}
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

