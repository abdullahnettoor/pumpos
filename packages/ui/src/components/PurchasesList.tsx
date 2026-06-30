import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { usePurchases, useShiftStatus, useSuppliers, useProducts, useTanks, useInvalidateOperational } from '../query/hooks.js';
import { Calendar, Plus, ShoppingCart, Info, Settings, Edit, Truck, Building } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { PurchaseEntryForm } from './transactions/PurchaseEntryForm.js';
import { LedgerView } from './ledger/LedgerView.js';
import { DataTable } from './primitives/DataTable.js';
import { Tabs } from './primitives/Tabs.js';
import { useToast } from './primitives/ToastProvider.js';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierPaymentSchema, type PurchaseEntryFormValues } from '@pump/shared';

const transactionService = new CloudTransactionService();

interface PurchasesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'registry';

const purchaseColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'businessDate',
    header: 'Date',
    cell: ({ row }) => {
      const d = row.original.businessDate ?? row.original.shiftDate;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-default)' }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          {d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
        </span>
      );
    },
  },
  { accessorKey: 'supplierName', header: 'Supplier', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'documentNumber', header: 'Reference', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>{(getValue() as string) || '—'}</span> },
  { accessorKey: 'invoiceNumber', header: 'Invoice', cell: ({ getValue }) => <span style={{ color: 'var(--text-strong)' }}>{(getValue() as string) || '--'}</span> },
  { accessorKey: 'notes', header: 'Notes', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '--'}</span> },
  {
    accessorKey: 'amount',
    header: 'Total Amount',
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>₹{Number(getValue()).toLocaleString('en-IN')}</span>,
  },
];

const buildSupplierColumns = (openLedger: (s: any) => void, openEdit: (s: any) => void): ColumnDef<any, any>[] => [
  {
    accessorKey: 'name',
    header: 'Supplier Name',
    cell: ({ row }) => {
      const sup = row.original;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building size={14} style={{ color: 'var(--text-muted)' }} />
          <div>
            <button type="button" onClick={() => openLedger(sup)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', fontWeight: 600, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}>{sup.name}</button>
            {sup.metadata?.tradeName && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{sup.metadata.tradeName}</div>}
            {sup.metadata?.gstin && <div style={{ fontSize: '10px', color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px' }}>GSTIN: {sup.metadata.gstin}</div>}
          </div>
        </div>
      );
    },
  },
  { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '-'}</span> },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => {
      const active = getValue() as boolean;
      return <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: active ? 'var(--state-success-bg)' : 'var(--state-danger-bg)', color: active ? 'var(--state-success-fg)' : 'var(--state-danger-fg)', padding: '2px 8px', borderRadius: 'var(--radius-chip)' }}>{active ? 'Active' : 'Suspended'}</span>;
    },
  },
  {
    accessorKey: 'currentBalance',
    header: 'Outstanding Balance',
    cell: ({ getValue }) => {
      const bal = Number(getValue() || 0);
      return <span style={{ fontWeight: 700, color: bal > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>₹{bal.toLocaleString('en-IN')}</span>;
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
  const toast = useToast();

  const purchases = purchasesQ.data ?? [];
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const suppliers = suppliersActiveQ.data ?? [];
  const allSuppliers = suppliersAllQ.data ?? [];
  const products = productsQ.data ?? [];
  const tanks = tanksQ.data ?? [];

  const loading = purchasesQ.isLoading || statusQ.isLoading || suppliersActiveQ.isLoading || productsQ.isLoading;
  const error = (purchasesQ.error || statusQ.error || suppliersActiveQ.error) as Error | null;

  const [purchaseDefaults, setPurchaseDefaults] = useState<Partial<PurchaseEntryFormValues>>({});

  // Purchase Form States
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    setPurchaseDefaults({
      targetShiftId: resolvePreferredShiftId(activeShift, recentClosedShifts),
      transactionDate: new Date().toISOString().slice(0, 10),
      supplierId: suppliers[0]?.id ?? '',
      invoiceNumber: '',
      notes: '',
      lines: [{ productId: products[0]?.id ?? '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }],
    });
  };

  const openPurchaseDrawer = () => {
    resetPurchaseForm();
    setIsPurchaseDrawerOpen(true);
  };

  const closePurchaseDrawer = () => {
    setIsPurchaseDrawerOpen(false);
    resetPurchaseForm();
  };

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
    if (isPurchaseDrawerOpen) return;
    setPurchaseDefaults((prev) => {
      const lines = prev.lines && prev.lines.length > 0
        ? prev.lines
        : [{ productId: products[0]?.id ?? '', quantity: undefined as unknown as number, unitPrice: undefined as unknown as number }];
      return {
        ...prev,
        targetShiftId: prev.targetShiftId || resolvePreferredShiftId(activeShift, recentClosedShifts),
        supplierId: prev.supplierId || suppliers[0]?.id || '',
        lines,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.data, suppliersActiveQ.data, productsQ.data]);

  const handleAddPurchase = async (values: PurchaseEntryFormValues) => {
    setFormError(null);
    if (!values.supplierId || values.lines.length === 0) return;

    try {
      setSubmitting(true);
      await transactionService.recordPurchase({
        stationId: stationId ?? undefined,
        transactionDate: values.transactionDate || undefined,
        supplierId: values.supplierId,
        invoiceNumber: values.invoiceNumber || undefined,
        notes: values.notes || undefined,
        lines: values.lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          tankAllocations: l.tankAllocations && l.tankAllocations.length > 0 ? l.tankAllocations : undefined,
        })),
      });

      closePurchaseDrawer();
      invalidateOperational(stationId);
      toast.success('Purchase recorded.');
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
            className="btn btn-primary btn-md"
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
      <Tabs
        aria-label="Purchases"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabType)}
        tabs={[
          { id: 'transactions', label: 'Intakes & Drops', icon: <ShoppingCart size={15} /> },
          { id: 'registry', label: 'Supplier Registry', icon: <Settings size={15} /> },
        ]}
      />

      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
              <span>Purchases post to the selected date — no open shift required. Each raises a supplier payable; record the payment separately.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Purchase Records</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Invoices: <strong>{purchases.length}</strong></span>
            </div>
            <DataTable
              columns={purchaseColumns}
              data={purchases}
              isLoading={loading}
              error={error}
              emptyMessage="No purchases logged yet."
              getRowId={(r: any) => r.documentNumber || r.id}
              initialSorting={[{ id: 'businessDate', desc: true }]}
            />
          </div>
        )}

        {activeTab === 'registry' && (
          <DataTable
            columns={buildSupplierColumns(openLedgerDrawer, openEditDrawer)}
            data={allSuppliers}
            emptyMessage="No suppliers registered."
            getRowId={(r: any) => r.id}
          />
        )}
      </div>

      {/* Purchase Entry Drawer */}
      <Drawer
        isOpen={isPurchaseDrawerOpen}
        onClose={closePurchaseDrawer}
        title="Record Purchase"
      >
        <PurchaseEntryForm
            shiftOptions={[]}
            showShiftHintWhenSingle={false}
            showDateField
            dateLabel="Purchase Date"
            defaultValues={purchaseDefaults}
            suppliers={suppliers}
            products={products}
            tanks={tanks}
            submitting={submitting}
            error={formError}
            onCancel={closePurchaseDrawer}
            onSubmit={handleAddPurchase}
            submitLabel="Record Purchase"
            submittingLabel="Recording..."
            invoiceLabel="Invoice Number / Reference"
            invoicePlaceholder="e.g. INV-10022"
            notesPlaceholder="e.g. invoice ref / delivery note"
          />
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

              <LedgerView
                entries={ledgerTransactions}
                loading={loadingLedger}
                error={ledgerError}
                amountLabel="Amount"
                balanceLabel="Owed Bal"
                emptyText="No transaction ledger events found."
                resolve={(tx: any) => {
                  const type = tx.transactionType;
                  const direction: 'debit' | 'credit' = type === 'Purchase' || type === 'Adjustment' ? 'debit' : 'credit';
                  return {
                    id: tx.id,
                    date: tx.createdAt,
                    dateLabel: new Date(tx.shiftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
                    subLabel: tx.shiftName,
                    type,
                    typeColor: type === 'Purchase' ? 'var(--brand-warning)' : 'var(--state-success-fg)',
                    notes: tx.notes,
                    amount: Number(tx.amount),
                    direction,
                  };
                }}
              />
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

