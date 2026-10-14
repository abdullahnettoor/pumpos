import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { useNavIntent, clearNavIntent, type NavIntent } from '../nav-intent/store.js';
import { ROUTES } from '../nav-intent/routes.js';
import { usePurchases, useSuppliers, useProducts } from '../query/hooks.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { openQuickEntry } from '../quick-entry/store.js';
import { DataTable } from './primitives/DataTable.js';
import { inr } from '../utils/format.js';
import { Tabs } from '../pump-ds/tabs/index.js';
import { PageLayout } from './primitives/PageLayout.js';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, DateText, Icon } from '../pump-ds/index.js';
import { resolveBusinessDate, resolveEntryDate } from '@pump/shared';
import { buildPurchaseColumns, buildSupplierColumns } from './purchases/columns.js';
import { LinkToDecantationDrawer } from './purchases/LinkToDecantationDrawer.js';
import { SupplierFormDrawer } from './purchases/SupplierFormDrawer.js';
import { SupplierStatementDrawer } from './purchases/SupplierStatementDrawer.js';

const transactionService = new CloudTransactionService();

interface PurchasesListProps {
  selectedStation: any | null;
  /** Shell navigation, for the link to Reports → GST (purchase ITC lives there). */
  onNavigate?: (path: string, intent?: NavIntent) => void;
}

type TabType = 'transactions' | 'registry';

export const PurchasesList: React.FC<PurchasesListProps> = ({ selectedStation, onNavigate }) => {
  const [selectedTab, setSelectedTab] = useState<TabType>('registry');
  // --- deep-link intent (from global search) ---
  // Derived, not copied into state by an effect: the old version bailed while
  // `suppliersAllQ` loaded and relied on re-running, so a deep link could be
  // dropped. A derivation just resolves once the suppliers land.
  const intent = useNavIntent();
  const focusSupplierId = intent?.focusSupplierId ?? null;
  const activeTab: TabType = focusSupplierId
    ? 'registry'
    : intent?.openNewPurchase
      ? 'transactions'
      : selectedTab;
  const setActiveTab = (tab: TabType) => {
    clearNavIntent();
    setSelectedTab(tab);
  };
  /**
   * Drop the deep link without moving the operator: the tab it derived is
   * committed to local state first, as ShiftsManagement does. Clearing alone
   * falls back to `selectedTab`, so closing a deep-linked statement would jump
   * to another tab.
   */
  const consumeIntent = () => {
    setSelectedTab(activeTab);
    clearNavIntent();
  };

  const stationId = selectedStation?.id ?? null;
  const purchasesQ = usePurchases(stationId ?? '');
  const suppliersActiveQ = useSuppliers(true);
  const suppliersAllQ = useSuppliers(false);
  const productsQ = useProducts();

  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);
  const allSuppliers = useMemo(() => suppliersAllQ.data ?? [], [suppliersAllQ.data]);

  const loading = purchasesQ.isLoading || suppliersActiveQ.isLoading || productsQ.isLoading;
  const error = purchasesQ.error || suppliersActiveQ.error;

  // Business-date bucketing for purchase KPIs + a purchases search filter.
  const stationSettings: any = selectedStation?.settings || {};
  const todayIso = resolveEntryDate({ timeZone: stationSettings.timezone });
  const businessToday = resolveBusinessDate({
    timeZone: stationSettings.timezone,
    dayStartsAt: stationSettings.business_day_starts_at,
  });
  const monthPrefix = todayIso.slice(0, 7);
  const businessMonthPrefix = businessToday.slice(0, 7);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const purchaseKpis = useMemo(() => {
    let today = 0,
      month = 0,
      todayCount = 0;
    for (const p of purchases) {
      const amt = Number(p.amount || 0);
      const date = p.entryDate || p.businessDate || '';
      const todayAnchor = p.entryDate ? todayIso : businessToday;
      if (date === todayAnchor) {
        today += amt;
        todayCount += 1;
      }
      const monthAnchor = p.entryDate ? monthPrefix : businessMonthPrefix;
      if (date.startsWith(monthAnchor)) month += amt;
    }
    const payables = allSuppliers.reduce(
      (s: number, x: any) => s + Math.max(0, Number(x.currentBalance || 0)),
      0,
    );
    return { today, month, todayCount, payables };
  }, [purchases, allSuppliers, todayIso, businessToday, monthPrefix, businessMonthPrefix]);
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

  // Recording opens the shared Office Record drawer (#526) in place.
  const openPurchaseDrawer = (supplier?: any) =>
    openQuickEntry(
      'purchase',
      supplier ? { origin: 'statement', party: supplier } : { origin: 'page' },
    );
  const openPaymentDrawer = () => openQuickEntry('supplier-payment', { origin: 'page' });

  // Deep link (dashboard "Plan purchase ›"): land on Purchases with a fuel
  // purchase open. The intent keeps the tab until the operator moves on; the
  // ref opens the drawer once per intent.
  const openedFor = useRef<NavIntent | null>(null);
  useEffect(() => {
    if (!intent?.openNewPurchase || openedFor.current === intent) return;
    openedFor.current = intent;
    openQuickEntry('purchase', { origin: 'page', purchaseType: 'FUEL' });
  }, [intent]);

  // Supplier form + statement drawers
  const [linkingPurchase, setLinkingPurchase] = useState<any | null>(null);
  const purchaseColumns = buildPurchaseColumns(setLinkingPurchase);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);
  const statementSupplier = focusSupplierId
    ? (allSuppliers.find((x: any) => x.id === focusSupplierId) ?? null)
    : (allSuppliers.find((x: any) => x.id === statementSupplierId) ?? null);
  /** See CustomersList: a setter competing with a derived intent must clear it. */
  const showStatementFor = (id: string | null) => {
    consumeIntent();
    setStatementSupplierId(id);
  };
  const closeStatement = () => showStatementFor(null);
  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setIsSupplierDrawerOpen(true);
  };
  const openEditSupplier = (sup: any) => {
    setEditingSupplier(sup);
    setIsSupplierDrawerOpen(true);
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

  return (
    <PageLayout
      title="Suppliers"
      subtitle="Record product inventory purchases, fuel tanker drops, and manage supplier accounts."
      actions={
        <>
          {activeTab === 'transactions' && (
            <>
              {onNavigate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onNavigate(ROUTES.reports, { openReportsTab: 'gst', openGstView: 'purchases' })
                  }
                >
                  GST (ITC) in Reports ›
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="wallet" size="sm" />}
                onClick={openPaymentDrawer}
              >
                Record supplier payment
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={() => openPurchaseDrawer()}
              >
                Record purchase
              </Button>
            </>
          )}
          {activeTab === 'registry' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Icon name="wallet" size="sm" />}
                onClick={openPaymentDrawer}
              >
                Record supplier payment
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
          aria-label="Suppliers"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabType)}
          tabs={[
            {
              id: 'registry',
              label: 'Suppliers',
              concept: 'suppliers',
            },
            { id: 'transactions', label: 'Purchases', concept: 'purchases' },
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
                label="Purchased today"
                value={inr(purchaseKpis.today)}
                hint={`${purchaseKpis.todayCount} ${purchaseKpis.todayCount === 1 ? 'invoice' : 'invoices'}`}
              />
              <KpiTile label="Purchased this month" value={inr(purchaseKpis.month)} />
              <KpiTile
                label="Total payables"
                value={inr(purchaseKpis.payables)}
                hint="Supplier dues"
              />
              <KpiTile label="Suppliers" value={String(allSuppliers.length)} />
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
                  initialSorting={[{ id: 'entryDate', desc: true }]}
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
      </div>

      <LinkToDecantationDrawer
        purchase={linkingPurchase}
        onClose={() => setLinkingPurchase(null)}
      />

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
                  <DateText
                    value={detailPurchase.entryDate ?? detailPurchase.businessDate}
                    tone="strong"
                  />
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
        clock={{
          timeZone: stationSettings.timezone,
          dayStartsAt: stationSettings.business_day_starts_at,
        }}
        onClose={closeStatement}
        onEdit={(sup) => {
          closeStatement();
          openEditSupplier(sup);
        }}
        onNewPurchase={(sup) => openPurchaseDrawer(sup)}
      />
    </PageLayout>
  );
};
