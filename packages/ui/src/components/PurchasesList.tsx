import React, { useEffect, useMemo, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { useNavIntent, clearNavIntent } from '../nav-intent/store.js';
import {
  usePurchases,
  useShiftStatus,
  useSuppliers,
  useProducts,
  useTanks,
  useInvalidateOperational,
  usePurchaseGstRegister,
} from '../query/hooks.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { PurchaseEntryForm, type PurchasePayNow } from './transactions/PurchaseEntryForm.js';
import { DataTable } from './primitives/DataTable.js';
import { inr } from '../utils/format.js';
import { Tabs } from './primitives/Tabs.js';
import { PageLayout } from './primitives/PageLayout.js';
import { useToast } from './primitives/ToastProvider.js';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, DateText, Icon } from '../pump-ds/index.js';
import { resolveBusinessDate, type PurchaseEntryFormValues } from '@pump/shared';
import { purchaseColumns, buildSupplierColumns } from './purchases/columns.js';
import { SupplierFormDrawer } from './purchases/SupplierFormDrawer.js';
import { SupplierStatementDrawer } from './purchases/SupplierStatementDrawer.js';
import { SupplierPaymentDrawer } from './purchases/SupplierPaymentDrawer.js';
import { useRunTask } from '../utils/runTask.js';

const transactionService = new CloudTransactionService();

interface PurchasesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'registry' | 'gst';

export const PurchasesList: React.FC<PurchasesListProps> = ({
  selectedStation,
  defaultShiftId,
}) => {
  const [selectedTab, setSelectedTab] = useState<TabType>('transactions');
  // --- deep-link intent (from global search) ---
  // Derived, not copied into state by an effect: the old version bailed while
  // `suppliersAllQ` loaded and relied on re-running, so a deep link could be
  // dropped. A derivation just resolves once the suppliers land.
  const intent = useNavIntent();
  const focusSupplierId = intent?.focusSupplierId ?? null;
  const activeTab: TabType = focusSupplierId ? 'registry' : selectedTab;
  const setActiveTab = (tab: TabType) => {
    clearNavIntent();
    setSelectedTab(tab);
  };

  const stationId = selectedStation?.id ?? null;
  const purchasesQ = usePurchases();
  const statusQ = useShiftStatus(stationId, true);
  const suppliersActiveQ = useSuppliers(true);
  const suppliersAllQ = useSuppliers(false);
  const productsQ = useProducts();
  const tanksQ = useTanks(stationId);
  const invalidateOperational = useInvalidateOperational();
  const toast = useToast();
  const runTask = useRunTask();

  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const suppliers = suppliersActiveQ.data ?? [];
  const allSuppliers = useMemo(() => suppliersAllQ.data ?? [], [suppliersAllQ.data]);
  const products = productsQ.data ?? [];
  const tanks = tanksQ.data ?? [];

  const loading =
    purchasesQ.isLoading || statusQ.isLoading || suppliersActiveQ.isLoading || productsQ.isLoading;
  const error = purchasesQ.error || statusQ.error || suppliersActiveQ.error;

  // Business-date bucketing for purchase KPIs + a purchases search filter.
  const stationSettings: any = selectedStation?.settings || {};
  const todayIso = resolveBusinessDate({
    timeZone: stationSettings.timezone,
    dayStartsAt: stationSettings.business_day_starts_at,
  });
  const monthPrefix = todayIso.slice(0, 7);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const purchaseKpis = useMemo(() => {
    let today = 0,
      month = 0,
      todayCount = 0;
    for (const p of purchases) {
      const amt = Number(p.amount || 0);
      const bd: string = p.businessDate || '';
      if (bd === todayIso) {
        today += amt;
        todayCount += 1;
      }
      if (bd.startsWith(monthPrefix)) month += amt;
    }
    const payables = allSuppliers.reduce(
      (s: number, x: any) => s + Math.max(0, Number(x.currentBalance || 0)),
      0,
    );
    return { today, month, todayCount, payables };
  }, [purchases, allSuppliers, todayIso, monthPrefix]);
  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p: any) =>
        (p.supplierName || '').toLowerCase().includes(q) ||
        (p.invoiceNumber || '').toLowerCase().includes(q) ||
        (p.documentNumber || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q),
    );
  }, [purchases, purchaseSearch]);

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
  // See IncomeList: a tab-gated query replaces the load-from-effect.
  const gstQ = usePurchaseGstRegister(
    { from: gstFrom, to: gstTo },
    { enabled: activeTab === 'gst' },
  );
  const gstRows = useMemo(() => gstQ.data ?? [], [gstQ.data]);
  const gstLoading = gstQ.isFetching;
  const gstError = gstQ.error ? gstQ.error.message : null;

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

  const resetPurchaseForm = (supplierId?: string) => {
    setFormError(null);
    setPurchaseDefaults({
      targetShiftId: resolvePreferredShiftId(activeShift, recentClosedShifts),
      transactionDate: new Date().toISOString().slice(0, 10),
      supplierId: supplierId || suppliers[0]?.id || '',
      invoiceNumber: '',
      notes: '',
      lines: [
        {
          productId: products[0]?.id ?? '',
          quantity: undefined as unknown as number,
          unitPrice: undefined as unknown as number,
        },
      ],
    });
  };

  const openPurchaseDrawer = (supplierId?: string) => {
    resetPurchaseForm(supplierId);
    setIsPurchaseDrawerOpen(true);
  };

  const closePurchaseDrawer = () => {
    setIsPurchaseDrawerOpen(false);
    resetPurchaseForm();
  };

  // Supplier form + statement drawers
  const [isPurchaseDrawerOpen, setIsPurchaseDrawerOpen] = useState(false);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const statementSupplier = focusSupplierId
    ? (allSuppliers.find((x: any) => x.id === focusSupplierId) ?? null)
    : (allSuppliers.find((x: any) => x.id === statementSupplierId) ?? null);
  const isPaymentDrawerOpen = intent?.open === 'supplier-payment' || paymentDrawerOpen;
  /** See CustomersList: a setter competing with a derived intent must clear it. */
  const showStatementFor = (id: string | null) => {
    clearNavIntent();
    setStatementSupplierId(id);
  };
  const closeStatement = () => showStatementFor(null);
  const closePaymentDrawer = () => {
    clearNavIntent();
    setPaymentDrawerOpen(false);
  };
  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setIsSupplierDrawerOpen(true);
  };
  const openEditSupplier = (sup: any) => {
    setEditingSupplier(sup);
    setIsSupplierDrawerOpen(true);
  };

  // Note: there is no pre-seeding effect here. Every path that opens the
  // purchase drawer calls `resetPurchaseForm` first, which rebuilds the defaults
  // from whatever the queries hold at that moment — so seeding them in advance
  // was duplicated work that could only ever be more stale than the reset.

  const handleAddPurchase = async (values: PurchaseEntryFormValues, payment?: PurchasePayNow) => {
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
          tankAllocations:
            l.tankAllocations && l.tankAllocations.length > 0 ? l.tankAllocations : undefined,
        })),
        payment: payment && payment.amount > 0 ? payment : undefined,
      });

      closePurchaseDrawer();
      toast.success(
        payment && payment.amount > 0 ? 'Purchase recorded with payment.' : 'Purchase recorded.',
      );
      await invalidateOperational(stationId);
    } catch (err: any) {
      setFormError(err.message || 'Failed to record supplier purchase');
    } finally {
      setSubmitting(false);
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
      <div
        style={{
          padding: '24px',
          backgroundColor: 'var(--state-danger-bg)',
          color: 'var(--state-danger-fg)',
          borderRadius: 'var(--radius-card)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <strong>Error:</strong> {error.message || 'Failed to load purchases data'}
      </div>
    );
  }

  const shiftOptions = [
    ...(activeShift
      ? [{ id: activeShift.id, label: `Active: ${activeShift.templateName} (Open)` }]
      : []),
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
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="wallet" size="sm" />}
                onClick={() => setPaymentDrawerOpen(true)}
              >
                Record Payment
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={() => openPurchaseDrawer()}
              >
                Add Purchase
              </Button>
            </>
          )}
          {activeTab === 'registry' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="wallet" size="sm" />}
                onClick={() => setPaymentDrawerOpen(true)}
              >
                Record Payment
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={openCreateSupplier}
              >
                Add Supplier
              </Button>
            </>
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
            { id: 'transactions', label: 'Intakes & Drops', icon: <Icon name="cart" size="xs" /> },
            {
              id: 'registry',
              label: 'Supplier Registry',
              icon: <Icon name="building" size="xs" />,
            },
            { id: 'gst', label: 'GST / ITC', icon: <Icon name="percent" size="xs" /> },
          ]}
        />
      }
    >
      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns={4}>
              <KpiTile
                dot="brand"
                label="Purchased Today"
                value={inr(purchaseKpis.today)}
                hint={`${purchaseKpis.todayCount} ${purchaseKpis.todayCount === 1 ? 'invoice' : 'invoices'}`}
              />
              <KpiTile dot="info" label="Purchased This Month" value={inr(purchaseKpis.month)} />
              <KpiTile
                dot="warning"
                valueTone="warning"
                label="Total Payables"
                value={inr(purchaseKpis.payables)}
                hint="Supplier dues"
              />
              <KpiTile dot="neutral" label="Suppliers" value={String(allSuppliers.length)} />
            </KpiStrip>

            <Panel
              flush
              title="Purchases"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Icon
                      name="search"
                      size="xs"
                      style={{
                        position: 'absolute',
                        left: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                      }}
                    />
                    <input
                      value={purchaseSearch}
                      onChange={(e) => setPurchaseSearch(e.target.value)}
                      placeholder="Search supplier / invoice…"
                      style={{
                        height: '28px',
                        padding: '0 8px 0 26px',
                        width: '220px',
                        borderRadius: 'var(--radius-input)',
                        border: '1px solid var(--border-strong)',
                        fontSize: '12px',
                        background: 'var(--bg-surface)',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="About purchases"
                    title="Purchases post to the selected date — no open shift required. Each raises a supplier payable; pay immediately via 'Record payment now' in the purchase form, or later from the supplier statement."
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '28px',
                      width: '22px',
                      marginLeft: '2px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-faint)',
                      cursor: 'help',
                    }}
                  >
                    <Icon name="help" size="xs" />
                  </button>
                </div>
              }
            >
              {loading ? (
                <div style={{ padding: '16px' }}>
                  <LoadingSpinner text="Loading purchases…" />
                </div>
              ) : filteredPurchases.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Icon name="cart" size="md" />}
                    title={purchases.length === 0 ? 'No purchases yet' : 'No matching purchases'}
                    description={
                      purchases.length === 0
                        ? 'Record a purchase to see it here.'
                        : 'Try a different search term.'
                    }
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={purchaseColumns}
                  data={filteredPurchases}
                  emptyMessage="No purchases logged yet."
                  getRowId={(r: any) => r.documentNumber || r.id}
                  initialSorting={[{ id: 'businessDate', desc: true }]}
                  onRowClick={(r: any) => openPurchaseDetail(r)}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'registry' && (
          <DataTable
            columns={buildSupplierColumns((sup: any) => showStatementFor(sup.id), openEditSupplier)}
            data={allSuppliers}
            emptyMessage="No suppliers registered."
            getRowId={(r: any) => r.id}
          />
        )}

        {activeTab === 'gst' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: 'var(--state-info-bg)',
                color: 'var(--state-info-fg)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-card)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border-soft)',
              }}
            >
              <Icon name="info" size="xs" />
              <span>
                Input GST credit (ITC) on GST purchase lines. Fuel (VAT) and exempt items carry no
                input credit and are excluded.
              </span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  From
                </label>
                <input
                  type="date"
                  value={gstFrom}
                  onChange={(e) => setGstFrom(e.target.value)}
                  className="input input-compact"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  To
                </label>
                <input
                  type="date"
                  value={gstTo}
                  onChange={(e) => setGstTo(e.target.value)}
                  className="input input-compact"
                />
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={() => void gstQ.refetch()}
                loading={gstLoading}
              >
                Apply
              </Button>
            </div>

            {/* Summary cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
              }}
            >
              {[
                { label: 'Taxable Value', value: gstTotals.taxable, strong: false },
                { label: 'CGST', value: gstTotals.cgst, strong: false },
                { label: 'SGST', value: gstTotals.sgst, strong: false },
                { label: 'IGST', value: gstTotals.igst, strong: false },
                { label: 'Cess', value: gstTotals.cess, strong: false },
                { label: 'Total ITC', value: gstItcTotal, strong: true },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-card)',
                    padding: '12px 14px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {card.label}
                  </span>
                  <p
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      marginTop: '4px',
                      color: card.strong ? 'var(--brand-primary)' : 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(card.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Register table */}
            {gstError ? (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--state-danger-bg)',
                  color: 'var(--state-danger-fg)',
                  borderRadius: 'var(--radius-card)',
                  fontSize: '12px',
                }}
              >
                {gstError}
              </div>
            ) : gstLoading ? (
              <LoadingSpinner text="Loading GST register…" />
            ) : gstRows.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                No GST purchases in this period.
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-card)',
                  overflow: 'auto',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderBottom: '1px solid var(--border-soft)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Date
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Supplier</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Invoice</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Product</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        Rate
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        Taxable
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        CGST
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        SGST
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        IGST
                      </th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstRows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td
                          style={{
                            padding: '8px 10px',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-default)',
                          }}
                        >
                          <DateText value={r.businessDate} variant="compact" tone="muted" />
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            color: 'var(--text-strong)',
                            fontWeight: 600,
                          }}
                        >
                          {r.supplierName}
                          {r.supplierGstin && (
                            <div
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 400,
                              }}
                            >
                              {r.supplierGstin}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                          {r.invoiceNumber || r.documentNumber || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                          {r.productName}
                          {r.productCode ? (
                            <span style={{ color: 'var(--text-muted)' }}> ({r.productCode})</span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {Number(r.gstRate || 0)}%
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ₹
                          {Number(r.taxableAmount || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ₹
                          {Number(r.cgst || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ₹
                          {Number(r.sgst || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          ₹
                          {Number(r.igst || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: 'var(--text-strong)',
                          }}
                        >
                          ₹
                          {Number(r.lineTotal || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
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
      <Drawer isOpen={isPurchaseDrawerOpen} onClose={closePurchaseDrawer} title="Record Purchase">
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
          timeZone={stationSettings.timezone}
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-card)',
                padding: '14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                fontSize: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Supplier
                </span>
                <strong style={{ color: 'var(--text-strong)' }}>
                  {detailPurchase.supplierName || '—'}
                </strong>
              </div>
              <div>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Date
                </span>
                <strong style={{ color: 'var(--text-strong)' }}>
                  <DateText value={detailPurchase.businessDate} tone="strong" />
                </strong>
              </div>
              <div>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Reference
                </span>
                <strong style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                  {detailPurchase.documentNumber || '—'}
                </strong>
              </div>
              <div>
                <span
                  style={{
                    color: 'var(--text-muted)',
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Supplier Invoice
                </span>
                <strong style={{ color: 'var(--text-strong)' }}>
                  {detailPurchase.invoiceNumber || '—'}
                </strong>
              </div>
            </div>

            {/* Line items */}
            <div>
              <h4
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  marginBottom: '8px',
                }}
              >
                Line Items
              </h4>
              {loadingDetail ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>
                  Loading line items…
                </div>
              ) : detailItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>
                  No line items recorded for this purchase.
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          borderBottom: '1px solid var(--border-soft)',
                          color: 'var(--text-muted)',
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Product</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Qty
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Rate
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Taxable
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Tax
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((it) => {
                        const tax =
                          Number(it.cgst || 0) +
                          Number(it.sgst || 0) +
                          Number(it.igst || 0) +
                          Number(it.vat || 0) +
                          Number(it.cess || 0);
                        const taxLabel =
                          it.taxCategory === 'GST'
                            ? Number(it.igst || 0) > 0
                              ? `IGST ${it.gstRate || 0}%`
                              : `GST ${it.gstRate || 0}%`
                            : it.taxCategory === 'FUEL_VAT'
                              ? 'Incl.'
                              : '—';
                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                            <td
                              style={{
                                padding: '8px 10px',
                                color: 'var(--text-strong)',
                                fontWeight: 600,
                              }}
                            >
                              {it.productName}
                              {it.productCode ? (
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                  {' '}
                                  ({it.productCode})
                                </span>
                              ) : null}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {Number(it.quantity).toLocaleString('en-IN')}
                              {it.unit ? ` ${it.unit}` : ''}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              ₹
                              {Number(it.unitPrice).toLocaleString('en-IN', {
                                maximumFractionDigits: 4,
                              })}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              ₹
                              {Number(it.taxableAmount).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {tax > 0 ? (
                                `₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                              ) : (
                                <span style={{ fontSize: '11px' }}>{taxLabel}</span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: 'var(--text-strong)',
                              }}
                            >
                              ₹
                              {Number(it.lineTotal).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tax totals */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backgroundColor: 'var(--bg-surface-alt)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-card)',
                padding: '12px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-muted)',
                }}
              >
                <span>Taxable</span>
                <span>
                  ₹
                  {Number(detailPurchase.taxableAmount || 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              {Number(detailPurchase.cgstTotal || 0) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>CGST + SGST</span>
                  <span>
                    ₹
                    {(
                      Number(detailPurchase.cgstTotal || 0) + Number(detailPurchase.sgstTotal || 0)
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {Number(detailPurchase.igstTotal || 0) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>IGST</span>
                  <span>
                    ₹
                    {Number(detailPurchase.igstTotal || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {Number(detailPurchase.cessTotal || 0) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>Cess</span>
                  <span>
                    ₹
                    {Number(detailPurchase.cessTotal || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                  borderTop: '1px solid var(--border-soft)',
                  paddingTop: '4px',
                  marginTop: '2px',
                }}
              >
                <span>Invoice Total</span>
                <span>
                  ₹
                  {Number(detailPurchase.amount || 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {detailPurchase.notes && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-default)' }}>Notes:</strong>{' '}
                {detailPurchase.notes}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <SupplierFormDrawer
        isOpen={isSupplierDrawerOpen}
        editingSupplier={editingSupplier}
        stationId={stationId}
        onClose={() => setIsSupplierDrawerOpen(false)}
      />

      <SupplierStatementDrawer
        supplier={statementSupplier}
        stationId={stationId}
        onClose={closeStatement}
        onEdit={(sup) => {
          closeStatement();
          openEditSupplier(sup);
        }}
        onNewPurchase={(sup) => {
          closeStatement();
          openPurchaseDrawer(sup.id);
        }}
      />

      <SupplierPaymentDrawer
        timeZone={stationSettings.timezone}
        isOpen={isPaymentDrawerOpen}
        suppliers={allSuppliers}
        stationId={stationId}
        onClose={closePaymentDrawer}
        onDone={() => invalidateOperational(stationId)}
      />
    </PageLayout>
  );
};
