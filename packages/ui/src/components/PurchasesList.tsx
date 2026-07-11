import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { usePurchases, useShiftStatus, useSuppliers, useProducts, useTanks, useInvalidateOperational } from '../query/hooks.js';
import { Calendar, Plus, ShoppingCart, Info, Settings, Edit, Truck, Building, Percent } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { PurchaseEntryForm } from './transactions/PurchaseEntryForm.js';
import { LedgerView } from './ledger/LedgerView.js';
import { DataTable } from './primitives/DataTable.js';
import { Checkbox } from './primitives/Toggle.js';
import { inr } from '../utils/format.js';
import { Tabs } from './primitives/Tabs.js';
import { PageLayout } from './primitives/PageLayout.js';
import { AccountSelect } from './primitives/AccountSelect.js';
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

type TabType = 'transactions' | 'registry' | 'gst';

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
    cell: ({ getValue }) => <span style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{inr(getValue())}</span>,
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
      return <span style={{ fontWeight: 700, color: bal > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>{inr(bal)}</span>;
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

  // Purchase detail drawer (line items + tax breakdown)
  const [detailPurchase, setDetailPurchase] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openPurchaseDetail = async (p: any) => {
    setDetailPurchase(p);
    setDetailItems([]);
    setLoadingDetail(true);
    try {
      const items = await transactionService.getPurchaseItems(p.id);
      setDetailItems(items || []);
    } catch {
      setDetailItems([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  // GST / ITC register
  const monthStart = new Date();
  monthStart.setDate(1);
  const [gstFrom, setGstFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [gstTo, setGstTo] = useState(new Date().toISOString().slice(0, 10));
  const [gstRows, setGstRows] = useState<any[]>([]);
  const [gstLoading, setGstLoading] = useState(false);
  const [gstError, setGstError] = useState<string | null>(null);

  const loadGstRegister = async () => {
    setGstLoading(true);
    setGstError(null);
    try {
      const rows = await transactionService.getPurchaseGstRegister(gstFrom || undefined, gstTo || undefined);
      setGstRows(rows || []);
    } catch (e: any) {
      setGstError(e.message || 'Failed to load GST register');
    } finally {
      setGstLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'gst') loadGstRegister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const gstTotals = gstRows.reduce(
    (acc, r) => ({
      taxable: acc.taxable + Number(r.taxableAmount || 0),
      cgst: acc.cgst + Number(r.cgst || 0),
      sgst: acc.sgst + Number(r.sgst || 0),
      igst: acc.igst + Number(r.igst || 0),
      cess: acc.cess + Number(r.cess || 0),
      total: acc.total + Number(r.lineTotal || 0),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
  );
  const gstItcTotal = gstTotals.cgst + gstTotals.sgst + gstTotals.igst + gstTotals.cess;

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
    watch: watchPay,
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
        accountId: data.accountId || undefined,
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

  const handleAddPurchase = async (values: PurchaseEntryFormValues, payment?: { amount: number; accountId?: string | null }) => {
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
        payment: payment && payment.amount > 0 ? { amount: payment.amount, accountId: payment.accountId ?? null } : undefined,
      });

      closePurchaseDrawer();
      invalidateOperational(stationId);
      toast.success(payment && payment.amount > 0 ? 'Purchase recorded with payment.' : 'Purchase recorded.');
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
    <PageLayout
      title="Supplier Purchases"
      subtitle="Record product inventory purchases, fuel tanker drops, and manage supplier accounts."
      actions={
        <>
          {activeTab === 'transactions' && (
            <button onClick={() => openPurchaseDrawer()} className="btn btn-primary btn-md">
              <Plus size={14} /> Add Purchase
            </button>
          )}
          {activeTab === 'registry' && (
            <button onClick={openCreateDrawer} className="btn btn-primary btn-md">
              <Plus size={14} /> Add Supplier
            </button>
          )}
        </>
      }
      toolbar={
        <Tabs
          variant="underline"
          aria-label="Purchases"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabType)}
          tabs={[
            { id: 'transactions', label: 'Intakes & Drops', icon: <ShoppingCart size={15} /> },
            { id: 'registry', label: 'Supplier Registry', icon: <Settings size={15} /> },
            { id: 'gst', label: 'GST / ITC', icon: <Percent size={15} /> },
          ]}
        />
      }
    >
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
              onRowClick={(r: any) => openPurchaseDetail(r)}
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

        {activeTab === 'gst' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', padding: '10px 12px', borderRadius: 'var(--radius-card)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border-soft)' }}>
              <Info size={14} />
              <span>Input GST credit (ITC) on GST purchase lines. Fuel (VAT) and exempt items carry no input credit and are excluded.</span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>From</label>
                <input type="date" value={gstFrom} onChange={(e) => setGstFrom(e.target.value)} className="input input-compact" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>To</label>
                <input type="date" value={gstTo} onChange={(e) => setGstTo(e.target.value)} className="input input-compact" />
              </div>
              <button className="btn btn-secondary btn-md" onClick={loadGstRegister} disabled={gstLoading}>{gstLoading ? 'Loading…' : 'Apply'}</button>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Taxable Value', value: gstTotals.taxable, strong: false },
                { label: 'CGST', value: gstTotals.cgst, strong: false },
                { label: 'SGST', value: gstTotals.sgst, strong: false },
                { label: 'IGST', value: gstTotals.igst, strong: false },
                { label: 'Cess', value: gstTotals.cess, strong: false },
                { label: 'Total ITC', value: gstItcTotal, strong: true },
              ].map((card) => (
                <div key={card.label} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '12px 14px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</span>
                  <p style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px', color: card.strong ? 'var(--brand-primary)' : 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{inr(card.value)}</p>
                </div>
              ))}
            </div>

            {/* Register table */}
            {gstError ? (
              <div style={{ padding: '12px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)', fontSize: '12px' }}>{gstError}</div>
            ) : gstLoading ? (
              <LoadingSpinner text="Loading GST register…" />
            ) : gstRows.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)' }}>No GST purchases in this period.</div>
            ) : (
              <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Supplier</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Invoice</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Product</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Taxable</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>CGST</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>SGST</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>IGST</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstRows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text-default)' }}>{r.businessDate ? new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-strong)', fontWeight: 600 }}>
                          {r.supplierName}
                          {r.supplierGstin && <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>{r.supplierGstin}</div>}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>{r.invoiceNumber || r.documentNumber || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>{r.productName}{r.productCode ? <span style={{ color: 'var(--text-muted)' }}> ({r.productCode})</span> : null}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{Number(r.gstRate || 0)}%</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(r.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(r.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(r.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(r.igst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>₹{Number(r.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
            stationId={stationId}
            enablePayment
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

      {/* Purchase Detail Drawer */}
      <Drawer
        isOpen={detailPurchase !== null}
        onClose={() => setDetailPurchase(null)}
        title="Purchase Invoice"
      >
        {detailPurchase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-sans)' }}>
            {/* Header */}
            <div style={{ backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Supplier</span>
                <strong style={{ color: 'var(--text-strong)' }}>{detailPurchase.supplierName || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</span>
                <strong style={{ color: 'var(--text-strong)' }}>{detailPurchase.businessDate ? new Date(detailPurchase.businessDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reference</span>
                <strong style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{detailPurchase.documentNumber || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Supplier Invoice</span>
                <strong style={{ color: 'var(--text-strong)' }}>{detailPurchase.invoiceNumber || '—'}</strong>
              </div>
            </div>

            {/* Line items */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>Line Items</h4>
              {loadingDetail ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>Loading line items…</div>
              ) : detailItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>No line items recorded for this purchase.</div>
              ) : (
                <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Product</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Taxable</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Tax</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((it) => {
                        const tax = Number(it.cgst || 0) + Number(it.sgst || 0) + Number(it.igst || 0) + Number(it.vat || 0) + Number(it.cess || 0);
                        const taxLabel = it.taxCategory === 'GST'
                          ? (Number(it.igst || 0) > 0 ? `IGST ${it.gstRate || 0}%` : `GST ${it.gstRate || 0}%`)
                          : it.taxCategory === 'FUEL_VAT' ? 'Incl.' : '—';
                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                            <td style={{ padding: '8px 10px', color: 'var(--text-strong)', fontWeight: 600 }}>
                              {it.productName}{it.productCode ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({it.productCode})</span> : null}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(it.quantity).toLocaleString('en-IN')}{it.unit ? ` ${it.unit}` : ''}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(it.unitPrice).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₹{Number(it.taxableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{tax > 0 ? `₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : <span style={{ fontSize: '11px' }}>{taxLabel}</span>}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>₹{Number(it.lineTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tax totals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--bg-surface-alt)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', padding: '12px 14px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Taxable</span><span>₹{Number(detailPurchase.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              {Number(detailPurchase.cgstTotal || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>CGST + SGST</span><span>₹{(Number(detailPurchase.cgstTotal || 0) + Number(detailPurchase.sgstTotal || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
              {Number(detailPurchase.igstTotal || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>IGST</span><span>₹{Number(detailPurchase.igstTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
              {Number(detailPurchase.cessTotal || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}><span>Cess</span><span>₹{Number(detailPurchase.cessTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-strong)', borderTop: '1px solid var(--border-soft)', paddingTop: '4px', marginTop: '2px' }}><span>Invoice Total</span><span>₹{Number(detailPurchase.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            </div>

            {detailPurchase.notes && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-default)' }}>Notes:</strong> {detailPurchase.notes}</div>
            )}
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
            <Checkbox
              label="Supplier Active (Clear for purchase drops)"
              checked={supIsActive}
              onChange={(e) => setSupIsActive(e.target.checked)}
              disabled={drawerSubmitting}
            />
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
                    {inr(selectedLedgerSupplier.currentBalance || 0)}
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
                      type="number" min="0"
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Paid from</label>
                    <AccountSelect
                      stationId={stationId}
                      value={(watchPay('accountId') as string) || ''}
                      onChange={(v) => setValuePay('accountId', v)}
                      disabled={paymentSubmitting}
                    />
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
    </PageLayout>
  );
};

