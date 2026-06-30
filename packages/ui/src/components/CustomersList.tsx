import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { useCustomers, useShiftStatus, useProducts, useInvalidateOperational } from '../query/hooks.js';
import { User, ShieldAlert, CreditCard, DollarSign, Plus, Info, Edit, Check, Settings, Scale, Truck, Trash2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { CollectionEntryForm } from './transactions/CollectionEntryForm.js';
import { LedgerView } from './ledger/LedgerView.js';
import { DataTable } from './primitives/DataTable.js';
import { Tabs } from './primitives/Tabs.js';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerCreateSchema, type CollectionEntryFormValues } from '@pump/shared';

const transactionService = new CloudTransactionService();

interface CustomersListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'registry' | 'vehicles';

const chip = (text: string, bg: string, fg: string) => (
  <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: bg, color: fg, padding: '2px 8px', borderRadius: 'var(--radius-chip)' }}>{text}</span>
);

const buildCustomerColumns = (openLedger: (c: any) => void, openEdit: (c: any) => void): ColumnDef<any, any>[] => [
  {
    accessorKey: 'name',
    header: 'Customer Name',
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={14} style={{ color: 'var(--text-muted)' }} />
          <div>
            <button type="button" onClick={() => openLedger(c)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 600, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}>{c.name}</button>
            {c.metadata?.tradeName && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{c.metadata.tradeName}</div>}
            {c.metadata?.gstin && <div style={{ fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN: {c.metadata.gstin}</div>}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'customerType',
    header: 'Account Type',
    cell: ({ getValue }) => {
      const t = getValue() as string;
      return chip(
        t,
        t === 'Fleet' ? 'var(--state-info-bg)' : t === 'Credit' ? 'var(--state-warning-bg)' : 'var(--bg-surface-alt)',
        t === 'Fleet' ? 'var(--state-info-fg)' : t === 'Credit' ? 'var(--state-warning-fg)' : 'var(--text-strong)',
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '-'}</span> },
  {
    accessorKey: 'creditLimit',
    header: 'Credit Limit',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      if (limit <= 0) return <span style={{ color: 'var(--text-muted)' }}>N/A</span>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>₹{limit.toLocaleString('en-IN')}</span>
          <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border-soft)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (balance / limit) * 100)}%`, height: '100%', backgroundColor: balance > limit ? 'var(--brand-danger)' : balance >= limit * 0.75 ? 'var(--brand-warning)' : 'var(--brand-primary)' }} />
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'isPrepaid',
    header: 'Prepaid Mode',
    cell: ({ getValue }) => (getValue() ? chip('Enabled', 'var(--state-info-bg)', 'var(--state-info-fg)') : chip('Disabled', 'var(--bg-surface-alt)', 'var(--text-muted)')),
  },
  {
    accessorKey: 'prepaidBalance',
    header: 'Prepaid Balance',
    cell: ({ row }) => {
      const c = row.original;
      return <span style={{ fontWeight: 700, color: c.isPrepaid ? 'var(--state-success-fg)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>₹{Number(c.prepaidBalance || 0).toLocaleString('en-IN')}</span>;
    },
  },
  { accessorKey: 'fleetCode', header: 'Fleet Code', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '-'}</span> },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => (getValue() ? chip('Active', 'var(--state-success-bg)', 'var(--state-success-fg)') : chip('Suspended', 'var(--state-danger-bg)', 'var(--state-danger-fg)')),
  },
  {
    accessorKey: 'currentBalance',
    header: 'Outstanding Balance',
    cell: ({ row }) => {
      const limit = Number(row.original.creditLimit || 0);
      const balance = Number(row.original.currentBalance || 0);
      const color = limit > 0 && balance > limit ? 'var(--brand-danger)' : balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
      return <span style={{ fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>₹{balance.toLocaleString('en-IN')}</span>;
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <button onClick={() => openEdit(row.original)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
        <Edit size={14} />
      </button>
    ),
  },
];

export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation, defaultShiftId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');

  const stationId = selectedStation?.id ?? null;
  const customersActiveQ = useCustomers(true);
  const customersAllQ = useCustomers(false);
  const statusQ = useShiftStatus(stationId, true);
  const productsQ = useProducts();
  const invalidateOperational = useInvalidateOperational();

  const customers = customersActiveQ.data ?? [];
  const allCustomers = customersAllQ.data ?? [];
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const fuelProducts = (productsQ.data ?? []).filter((p: any) => p.productType === 'FUEL' && p.isActive);

  const loading = customersActiveQ.isLoading || statusQ.isLoading;
  const error = (customersActiveQ.error || statusQ.error) as Error | null;

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
  const [collectionDefaults, setCollectionDefaults] = useState<Partial<CollectionEntryFormValues>>({});
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  // Prepaid top-up state
  const [isTopupDrawerOpen, setIsTopupDrawerOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupPaymentMethod, setTopupPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'BankTransfer'>('Cash');
  const [topupNotes, setTopupNotes] = useState('');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  // Vehicles tab state
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
    setCollectionDefaults({
      targetShiftId: preferredShiftId,
      transactionDate: new Date().toISOString().slice(0, 10),
      customerId: customers[0]?.id || '',
      amount: undefined as unknown as number,
      paymentMethod: 'Cash',
      notes: '',
    });
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
      isPrepaid: false,
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
    if (activeTab === 'vehicles' && vehicleCustomerId) {
      loadVehicles(vehicleCustomerId);
    }
  }, [activeTab, vehicleCustomerId]);

  // Initialise default selections from query data once it loads.
  useEffect(() => {
    const eligible = allCustomers.filter((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet');
    setVehicleCustomerId((prev) => prev || eligible[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersAllQ.data]);

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

  const onAddCollection = async (values: CollectionEntryFormValues) => {
    setFormError(null);
    if (!values.targetShiftId) {
      setFormError('A shift is required to record this entry.');
      return;
    }

    try {
      setCollectionSubmitting(true);
      await transactionService.recordCollection({
        shiftId: values.targetShiftId,
        customerId: values.customerId || undefined,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
      });

      closeCollectionDrawer();
      invalidateOperational(stationId);
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
      isPrepaid: false,
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
      isPrepaid: Boolean(cust.isPrepaid),
      isActive: cust.isActive,
      metadata: {
        gstin: meta.gstin || '',
        stateCode: meta.stateCode || '',
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
        isPrepaid: Boolean(data.isPrepaid),
        isActive: data.isActive,
        metadata: {
          gstin: data.metadata?.gstin || null,
          stateCode: data.metadata?.stateCode || null,
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
      invalidateOperational(stationId);
    } catch (err: any) {
      setDrawerError(err.message || 'Failed to save customer');
    }
  };

  const openTopupDrawer = () => {
    setTopupAmount('');
    setTopupPaymentMethod('Cash');
    setTopupNotes('');
    setTopupError(null);
    setIsTopupDrawerOpen(true);
  };

  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLedgerCustomer?.id || !topupAmount) {
      return;
    }

    try {
      setTopupSubmitting(true);
      setTopupError(null);
      await transactionService.topupCustomer(selectedLedgerCustomer.id, {
        amount: Number(topupAmount),
        paymentMethod: topupPaymentMethod,
        notes: topupNotes || undefined,
      });

      setIsTopupDrawerOpen(false);
      invalidateOperational(stationId);
      await openLedgerDrawer(selectedLedgerCustomer);
    } catch (err: any) {
      setTopupError(err.message || 'Failed to record top-up');
    } finally {
      setTopupSubmitting(false);
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
        <strong>Error:</strong> {error.message || 'Failed to load customers data'}
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
            className="btn btn-primary btn-md"
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
      <Tabs
        aria-label="Customers"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabType)}
        tabs={[
          { id: 'transactions', label: 'Shift Collections & Sales', icon: <CreditCard size={15} /> },
          { id: 'registry', label: 'Customer Registry', icon: <Settings size={15} /> },
          { id: 'vehicles', label: 'Vehicles', icon: <Truck size={15} /> },
        ]}
      />

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
          <DataTable
            columns={buildCustomerColumns(openLedgerDrawer, openEditDrawer)}
            data={allCustomers}
            emptyMessage="No customers registered."
            getRowId={(r: any) => r.id}
          />
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
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>State Code (place of supply)</label>
                <input
                  type="text"
                  placeholder="e.g. 29"
                  maxLength={2}
                  {...registerCust('metadata.stateCode')}
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
              id="custIsPrepaid"
              {...registerCust('isPrepaid')}
              disabled={drawerSubmitting}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="custIsPrepaid" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
              Enable Prepaid Wallet Mode
            </label>
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
        <CollectionEntryForm
            shiftOptions={[]}
            showShiftHintWhenSingle={false}
            showDateField
            dateLabel="Collection Date"
            defaultValues={collectionDefaults}
            customers={customers}
            submitting={collectionSubmitting}
            error={formError}
            onCancel={closeCollectionDrawer}
            onSubmit={onAddCollection}
            submitLabel={'Log Collection'}
            submittingLabel="Recording..."
            amountLabel="Amount (₹)"
            amountPlaceholder="0.00"
            notesLabel="Notes / Fleet Slip ID"
            notesPlaceholder="Slip code, transaction ref..."
            paymentMethodLabel="Entry Type / Payment Method"
            usePaymentMethodButtons={true}
            walkInOptionLabel="-- Walk-in / Cash Customer --"
            customerOptionLabel={(cust) => `${cust.name} (${cust.customerType})`}
          />
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
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {selectedLedgerCustomer.isPrepaid ? 'Prepaid Wallet Balance' : 'Outstanding Balance'}
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: selectedLedgerCustomer.isPrepaid
                      ? 'var(--state-success-fg)'
                      : selectedLedgerCustomer.creditLimit > 0 && selectedLedgerCustomer.currentBalance > selectedLedgerCustomer.creditLimit
                        ? 'var(--brand-danger)'
                        : selectedLedgerCustomer.currentBalance > 0
                          ? 'var(--brand-warning)'
                          : 'var(--state-success-fg)'
                  }}>
                    ₹{Number(selectedLedgerCustomer.isPrepaid ? selectedLedgerCustomer.prepaidBalance : selectedLedgerCustomer.currentBalance || 0).toLocaleString('en-IN')}
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

              {selectedLedgerCustomer.isPrepaid && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Top-up prepaid wallet for this customer.
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={openTopupDrawer}
                  >
                    <Plus size={12} /> Top Up
                  </button>
                </div>
              )}

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

              <LedgerView
                entries={ledgerTransactions}
                loading={loadingLedger}
                error={ledgerError}
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
                    dateLabel: new Date(tx.shiftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
                    subLabel: tx.shiftName,
                    type,
                    typeColor,
                    notes: tx.notes,
                    amount: Number(tx.amount),
                    direction,
                  };
                }}
              />
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
        isOpen={isTopupDrawerOpen}
        onClose={() => setIsTopupDrawerOpen(false)}
        title="Prepaid Wallet Top-Up"
      >
        <form onSubmit={handleTopupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {topupError && (
            <div style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', padding: '8px 12px', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
              {topupError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Amount (₹) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              disabled={topupSubmitting}
              placeholder="0.00"
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Payment Method *</label>
            <select
              value={topupPaymentMethod}
              onChange={(e) => setTopupPaymentMethod(e.target.value as any)}
              disabled={topupSubmitting}
              style={{ height: '32px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px' }}
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="BankTransfer">Bank Transfer</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Notes</label>
            <textarea
              rows={2}
              value={topupNotes}
              onChange={(e) => setTopupNotes(e.target.value)}
              disabled={topupSubmitting}
              placeholder="Optional reference or remark"
              style={{ padding: '6px 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={topupSubmitting || !topupAmount}
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
              {topupSubmitting ? 'Recording...' : 'Record Top-Up'}
            </button>

            <button
              type="button"
              onClick={() => setIsTopupDrawerOpen(false)}
              disabled={topupSubmitting}
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

