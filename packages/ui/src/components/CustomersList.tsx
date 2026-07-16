import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService } from '../services/cloud.js';
import { useCustomers, useShiftStatus, useProducts, useInvalidateOperational, useCollections, useCreditSales, useAllVehicles } from '../query/hooks.js';
import { Users, CreditCard, Plus, Truck, Search, Wallet, HelpCircle } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';
import { CollectionEntryForm } from './transactions/CollectionEntryForm.js';
import { DataTable } from './primitives/DataTable.js';
import { inr } from '../utils/format.js';
import { Tabs } from './primitives/Tabs.js';
import { PageLayout } from './primitives/PageLayout.js';
import { useConfirm } from './primitives/ConfirmDialog.js';
import { useToast } from './primitives/ToastProvider.js';
import { Panel, Button, Chip, KpiStrip, KpiTile, EmptyState } from '../pump-ds/index.js';
import type { NavIntent } from './AppShell.js';
import { resolveBusinessDate, type CollectionEntryFormValues } from '@pump/shared';
import { buildCustomerColumns, buildCollectionColumns, buildCreditSaleColumns, buildVehicleColumns } from './customers/columns.js';
import { CustomerFormDrawer } from './customers/CustomerFormDrawer.js';
import { VehicleDrawer } from './customers/VehicleDrawer.js';
import { StatementDrawer } from './customers/StatementDrawer.js';

const transactionService = new CloudTransactionService();

interface CustomersListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
  /** Optional deep-link intent (focus a customer, open a drawer). */
  intent?: NavIntent | null;
  /** Called once the intent has been handled so the parent can clear it. */
  onIntentConsumed?: () => void;
}

type TabType = 'transactions' | 'sales' | 'registry' | 'vehicles';

export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation, defaultShiftId, intent, onIntentConsumed }) => {
  const [activeTab, setActiveTab] = useState<TabType>('transactions');

  const stationId = selectedStation?.id ?? null;
  const customersActiveQ = useCustomers(true);
  const customersAllQ = useCustomers(false);
  const statusQ = useShiftStatus(stationId, true);
  const productsQ = useProducts();
  const collectionsQ = useCollections();
  const creditSalesQ = useCreditSales();
  const vehiclesQ = useAllVehicles(false);
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const customers = customersActiveQ.data ?? [];
  const allCustomers = customersAllQ.data ?? [];
  const allCollections = collectionsQ.data ?? [];
  const anyPrepaid = allCustomers.some((c: any) => c.isPrepaid);
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const fuelProducts = (productsQ.data ?? []).filter((p: any) => p.productType === 'FUEL' && p.isActive);

  // Business date (station-timezone aware) used to bucket "today" collections.
  const stationSettings: any = (selectedStation as any)?.settings || {};
  const todayIso = resolveBusinessDate({ timeZone: stationSettings.timezone, dayStartsAt: stationSettings.business_day_starts_at });
  const monthPrefix = todayIso.slice(0, 7);

  // Collections ledger filters
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<string>('all');

  const collectionKpis = useMemo(() => {
    let today = 0, month = 0, todayCount = 0;
    const todayCustomers = new Set<string>();
    for (const c of allCollections) {
      const amt = Number(c.amount || 0);
      const bd: string = c.businessDate || '';
      if (bd === todayIso) { today += amt; todayCount += 1; if (c.customerId) todayCustomers.add(c.customerId); }
      if (bd.startsWith(monthPrefix)) month += amt;
    }
    return { today, month, todayCount, todayCustomers: todayCustomers.size };
  }, [allCollections, todayIso, monthPrefix]);

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase();
    return allCollections.filter((c: any) => {
      if (collectionMethod !== 'all' && c.paymentMethod !== collectionMethod) return false;
      if (q && !((c.customerName || '').toLowerCase().includes(q) || (c.notes || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [allCollections, collectionSearch, collectionMethod]);

  // Credit-sales ledger
  const allCreditSales = creditSalesQ.data ?? [];
  const [salesSearch, setSalesSearch] = useState('');
  const salesKpis = useMemo(() => {
    let today = 0, month = 0, todayCount = 0;
    const custs = new Set<string>();
    for (const s of allCreditSales) {
      const amt = Number(s.amount || 0);
      const bd: string = s.businessDate || '';
      if (bd === todayIso) { today += amt; todayCount += 1; }
      if (bd.startsWith(monthPrefix)) month += amt;
      if (s.customerId) custs.add(s.customerId);
    }
    return { today, month, todayCount, customers: custs.size };
  }, [allCreditSales, todayIso, monthPrefix]);
  const filteredCreditSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    if (!q) return allCreditSales;
    return allCreditSales.filter((s: any) =>
      (s.customerName || '').toLowerCase().includes(q) ||
      (s.vehicleReg || '').toLowerCase().includes(q) ||
      (s.productName || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q));
  }, [allCreditSales, salesSearch]);

  const loading = customersActiveQ.isLoading || statusQ.isLoading;
  const error = (customersActiveQ.error || statusQ.error) as Error | null;

  const eligibleCustomers = allCustomers.filter((c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet');

  // --- Vehicles (list + filter) ---
  const allVehicles = vehiclesQ.data ?? [];
  const loadingVehicles = vehiclesQ.isLoading;
  const [vehicleSearch, setVehicleSearch] = useState('');
  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return allVehicles;
    return allVehicles.filter((v: any) =>
      (v.registrationNumber || '').toLowerCase().includes(q) ||
      (v.customerName || '').toLowerCase().includes(q) ||
      (v.vehicleType || '').toLowerCase().includes(q));
  }, [allVehicles, vehicleSearch]);

  // --- Customer form drawer ---
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const openCreateCustomer = () => { setEditingCustomer(null); setIsCustomerDrawerOpen(true); };
  const openEditCustomer = (cust: any) => { setEditingCustomer(cust); setIsCustomerDrawerOpen(true); };

  // --- Statement drawer ---
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null);

  // --- Vehicle drawer ---
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [vehicleCustomerId, setVehicleCustomerId] = useState('');
  const openCreateVehicle = () => { setEditingVehicle(null); setIsVehicleDrawerOpen(true); };
  const openEditVehicle = (v: any) => { setEditingVehicle(v); setIsVehicleDrawerOpen(true); };
  const onDeleteVehicle = async (vehicle: any) => {
    if (!(await confirm({ title: 'Delete vehicle?', message: `This will remove vehicle ${vehicle.registrationNumber}.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await transactionService.deleteCustomerVehicle(vehicle.id);
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete vehicle');
    }
  };

  // Default the "add vehicle" customer to the first eligible one.
  useEffect(() => {
    setVehicleCustomerId((prev) => prev || eligibleCustomers[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersAllQ.data]);

  // --- Collection drawer ---
  const [isCollectionDrawerOpen, setIsCollectionDrawerOpen] = useState(false);
  const [collectionDefaults, setCollectionDefaults] = useState<Partial<CollectionEntryFormValues>>({});
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId) {
      const matchesActive = active?.id === defaultShiftId;
      const matchesClosed = closedList.some((shift) => shift.id === defaultShiftId);
      if (matchesActive || matchesClosed) return defaultShiftId;
    }
    if (active) return active.id;
    if (closedList.length > 0) return closedList[0].id;
    return '';
  };

  const resetCollectionForm = (customerId?: string) => {
    const preferredShiftId = resolvePreferredShiftId(activeShift, recentClosedShifts);
    setCollectionDefaults({
      targetShiftId: preferredShiftId,
      transactionDate: new Date().toISOString().slice(0, 10),
      customerId: customerId || customers[0]?.id || '',
      amount: undefined as unknown as number,
      paymentMethod: 'Cash',
      notes: '',
    });
    setCollectionSubmitting(false);
    setFormError(null);
  };

  const openCollectionDrawer = (customerId?: string) => { resetCollectionForm(customerId); setIsCollectionDrawerOpen(true); };
  const closeCollectionDrawer = () => { setIsCollectionDrawerOpen(false); resetCollectionForm(); };

  const onAddCollection = async (values: CollectionEntryFormValues) => {
    setFormError(null);
    if (!values.targetShiftId) { setFormError('A shift is required to record this entry.'); return; }
    try {
      setCollectionSubmitting(true);
      await transactionService.recordCollection({
        shiftId: values.targetShiftId,
        customerId: values.customerId || undefined,
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        notes: values.notes || undefined,
        accountId: values.accountId || undefined,
      });
      closeCollectionDrawer();
      invalidateOperational(stationId);
      toast.success('Collection recorded.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to record entry');
    } finally {
      setCollectionSubmitting(false);
    }
  };

  // --- deep-link intent (from global search / quick-create) ---
  const handledIntentRef = useRef<NavIntent | null>(null);
  useEffect(() => {
    if (!intent || handledIntentRef.current === intent) return;
    // For a focus intent, wait until the customer list has loaded.
    if (intent.focusCustomerId && customersAllQ.isLoading) return;
    handledIntentRef.current = intent;
    if (intent.open === 'new-customer') openCreateCustomer();
    else if (intent.open === 'new-collection') openCollectionDrawer();
    if (intent.focusCustomerId) {
      const cust = allCustomers.find((c: any) => c.id === intent.focusCustomerId);
      if (cust) { setActiveTab('registry'); setStatementCustomer(cust); }
    }
    onIntentConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, allCustomers, customersAllQ.isLoading]);

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
    <PageLayout
      title="Customer Fleet Accounts"
      subtitle="Manage fleet customer profiles, credit limits, and record shift collections."
      actions={
        <>
          {activeTab === 'transactions' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={() => openCollectionDrawer()}>Add Collection</Button>
          )}
          {activeTab === 'registry' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openCreateCustomer}>Add Customer</Button>
          )}
          {activeTab === 'vehicles' && (
            <Button variant="primary" size="sm" leftIcon={<Plus />} disabled={eligibleCustomers.length === 0} onClick={openCreateVehicle}>Add Vehicle</Button>
          )}
        </>
      }
      toolbar={
        <Tabs
          variant="underline"
          aria-label="Customers"
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabType)}
          tabs={[
            { id: 'transactions', label: 'Collections', icon: <Wallet size={15} /> },
            { id: 'sales', label: 'Credit Sales', icon: <CreditCard size={15} /> },
            { id: 'registry', label: 'Customer Registry', icon: <Users size={15} /> },
            { id: 'vehicles', label: 'Vehicles', icon: <Truck size={15} /> },
          ]}
        />
      }
    >
      {/* Tab Contents */}
      <div>
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* KPI strip — today & month collections at a glance */}
            <KpiStrip columns={4}>
              <KpiTile dot="brand" label="Collected Today" value={inr(collectionKpis.today)} hint={`${collectionKpis.todayCount} ${collectionKpis.todayCount === 1 ? 'entry' : 'entries'}`} />
              <KpiTile dot="success" valueTone="success" label="Collected This Month" value={inr(collectionKpis.month)} />
              <KpiTile dot="info" label="Customers Paid Today" value={String(collectionKpis.todayCustomers)} />
              <KpiTile dot="warning" valueTone="warning" label="Total Receivables" value={inr(customers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0))} hint="Outstanding dues" />
            </KpiStrip>

            {/* Collections ledger */}
            <Panel
              flush
              title="Collections"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      placeholder="Search customer / note…"
                      style={{ height: '28px', padding: '0 8px 0 26px', width: '200px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                    />
                  </div>
                  <select
                    value={collectionMethod}
                    onChange={(e) => setCollectionMethod(e.target.value)}
                    style={{ height: '28px', padding: '0 6px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                  >
                    <option value="all">All methods</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="BankTransfer">Bank</option>
                  </select>
                  <button
                    type="button"
                    aria-label="Where do collections post?"
                    title={
                      activeShift || recentClosedShifts.length > 0
                        ? `New collections post to ${
                            resolvePreferredShiftId(activeShift, recentClosedShifts) === activeShift?.id
                              ? `${activeShift?.templateName} (active shift)`
                              : recentClosedShifts.find((s) => s.id === resolvePreferredShiftId(activeShift, recentClosedShifts))?.templateName ?? 'the selected shift'
                          }. Cash collections touch the drawer; card / UPI / bank do not.`
                        : 'Open a shift to record collections — cash collections are reconciled against the drawer.'
                    }
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '22px', marginLeft: '2px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'help' }}
                  >
                    <HelpCircle size={15} />
                  </button>
                </div>
              }
            >
              {collectionsQ.isLoading ? (
                <div style={{ padding: '16px' }}><LoadingSpinner text="Loading collections…" /></div>
              ) : filteredCollections.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Wallet />}
                    title={allCollections.length === 0 ? 'No collections yet' : 'No matching collections'}
                    description={allCollections.length === 0 ? 'Record a collection to see it here.' : 'Try clearing the search or method filter.'}
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={buildCollectionColumns()}
                  data={filteredCollections}
                  emptyMessage="No collections."
                  getRowId={(r: any) => r.id}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns={4}>
              <KpiTile dot="warning" valueTone="warning" label="Credit Issued Today" value={inr(salesKpis.today)} hint={`${salesKpis.todayCount} ${salesKpis.todayCount === 1 ? 'sale' : 'sales'}`} />
              <KpiTile dot="brand" label="Credit This Month" value={inr(salesKpis.month)} />
              <KpiTile dot="info" label="Customers on Credit" value={String(salesKpis.customers)} />
              <KpiTile dot="warning" valueTone="warning" label="Total Receivables" value={inr(customers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0))} hint="Outstanding dues" />
            </KpiStrip>

            <Panel
              flush
              title="Credit sales"
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      placeholder="Search customer / vehicle / product…"
                      style={{ height: '28px', padding: '0 8px 0 26px', width: '260px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                    />
                  </div>
                  <button type="button" aria-label="About credit sales" title="Credit sales are receivables — fuel-on-credit and merchandise on credit. They never touch the drawer; record them from the shift handover." style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '22px', marginLeft: '2px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'help' }}>
                    <HelpCircle size={15} />
                  </button>
                </div>
              }
            >
              {creditSalesQ.isLoading ? (
                <div style={{ padding: '16px' }}><LoadingSpinner text="Loading credit sales…" /></div>
              ) : filteredCreditSales.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<CreditCard />}
                    title={allCreditSales.length === 0 ? 'No credit sales yet' : 'No matching credit sales'}
                    description={allCreditSales.length === 0 ? 'Fuel-on-credit and merchandise-on-credit sales appear here.' : 'Try a different search term.'}
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={buildCreditSaleColumns()}
                  data={filteredCreditSales}
                  emptyMessage="No credit sales."
                  getRowId={(r: any) => r.id}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'registry' && (
          <DataTable
            columns={buildCustomerColumns(setStatementCustomer, openEditCustomer, anyPrepaid)}
            data={allCustomers}
            emptyMessage="No customers registered."
            getRowId={(r: any) => r.id}
          />
        )}

        {activeTab === 'vehicles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loadingVehicles ? (
              <LoadingSpinner text="Loading vehicles..." />
            ) : (
              <Panel
                flush
                title="Vehicles"
                action={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        value={vehicleSearch}
                        onChange={(e) => setVehicleSearch(e.target.value)}
                        placeholder="Search registration / customer…"
                        style={{ height: '28px', padding: '0 8px 0 26px', width: '240px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }}
                      />
                    </div>
                    <Chip tone="neutral" size="xs">{filteredVehicles.length}</Chip>
                  </div>
                }
              >
                {filteredVehicles.length === 0 ? (
                  <div style={{ padding: '12px' }}>
                    <EmptyState
                      compact
                      icon={<Truck />}
                      title={allVehicles.length === 0 ? 'No vehicles' : 'No matching vehicles'}
                      description={allVehicles.length === 0 ? 'Register a vehicle against a Credit or Fleet customer to see it here.' : 'Try a different search term.'}
                    />
                  </div>
                ) : (
                  <DataTable
                    bare
                    columns={buildVehicleColumns(openEditVehicle, onDeleteVehicle)}
                    data={filteredVehicles}
                    emptyMessage="No vehicles registered."
                    getRowId={(r: any) => r.id}
                  />
                )}
              </Panel>
            )}
          </div>
        )}
      </div>

      <CustomerFormDrawer
        isOpen={isCustomerDrawerOpen}
        editingCustomer={editingCustomer}
        stationId={stationId}
        onClose={() => setIsCustomerDrawerOpen(false)}
      />

      {/* Collections Drawer */}
      <Drawer
        isOpen={isCollectionDrawerOpen}
        onClose={closeCollectionDrawer}
        title="Log Customer Collection"
      >
        <CollectionEntryForm
            shiftOptions={[]}
            showShiftHintWhenSingle={false}
            showDateField
            dateLabel="Collection Date"
            stationId={selectedStation?.id}
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

      <StatementDrawer
        customer={statementCustomer}
        stationId={stationId}
        onClose={() => setStatementCustomer(null)}
        onEdit={(c) => { setStatementCustomer(null); openEditCustomer(c); }}
        onRecordCollection={(c) => { setStatementCustomer(null); openCollectionDrawer(c.id); }}
      />

      <VehicleDrawer
        isOpen={isVehicleDrawerOpen}
        editingVehicle={editingVehicle}
        defaultCustomerId={vehicleCustomerId}
        eligibleCustomers={eligibleCustomers}
        fuelProducts={fuelProducts}
        onClose={() => setIsVehicleDrawerOpen(false)}
      />
    </PageLayout>
  );
};

