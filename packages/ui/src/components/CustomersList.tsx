import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { canManageFinancialAccounts } from '@pump/shared';
import { useNavIntent, clearNavIntent, getNavIntentState } from '../nav-intent/store.js';
import { ROUTES } from '../nav-intent/routes.js';
import { CloudTransactionService } from '../services/cloud.js';
import { openQuickEntry } from '../quick-entry/store.js';
import {
  useCustomers,
  useProducts,
  useCollections,
  useCreditSales,
  useAllVehicles,
  useReceivables,
} from '../query/hooks.js';
import { Button, Icon, Tabs, tabPanelProps } from '../pump-ds/index.js';
import { PageFrame } from './page-frame/index.js';
import { useConfirm } from './primitives/ConfirmDialog.js';
import { useToast } from './primitives/ToastProvider.js';
import { CustomerFormDrawer } from './customers/CustomerFormDrawer.js';
import { VehicleDrawer } from './customers/VehicleDrawer.js';
import { StatementDrawer } from './customers/StatementDrawer.js';
import { CustomerListTab } from './customers/CustomerListTab.js';
import { CreditSalesTab } from './customers/CreditSalesTab.js';
import { CollectionsTab } from './customers/CollectionsTab.js';
import { VehiclesTab } from './customers/VehiclesTab.js';
import { useRunTask } from '../utils/runTask.js';

const transactionService = new CloudTransactionService();

interface CustomersListProps {
  selectedStation: any | null;
  /** Signed-in Role: locks the credit-limit field for Roles that may not change it. */
  userRole?: string;
  /** @deprecated Collections are office records now; ignored. */
  defaultShiftId?: string;
}

type TabType = 'transactions' | 'sales' | 'registry' | 'vehicles';

const TABS_ID = 'customers';

/**
 * The Customers page (#527): Page Frame, tabs Customers · Credit sales ·
 * Collections · Vehicles. The list is a balance list and the two money tabs
 * are ledgers (layout B); each tab loads in its own Data Sections, so one
 * failed request shows Retry only where it is needed.
 */
export const CustomersList: React.FC<CustomersListProps> = ({ selectedStation, userRole }) => {
  const [selectedTab, setSelectedTab] = useState<TabType>('registry');
  /**
   * Drop a pending deep link without moving the operator. A focus intent
   * derives the Customers tab, so that tab is committed to local state before
   * the intent is cleared (the ShiftsManagement pattern); clearing alone would
   * fall back to whichever tab was chosen before the link arrived.
   */
  const consumeIntent = () => {
    if (getNavIntentState().intent?.focusCustomerId) setSelectedTab('registry');
    clearNavIntent();
  };

  const stationId = selectedStation?.id ?? null;
  // Receivables are read by the Roles that see money (the API refuses Staff).
  const canReadReceivables = canManageFinancialAccounts((userRole ?? 'Staff') as any);
  const customersAllQ = useCustomers(false);
  const productsQ = useProducts();
  const collectionsQ = useCollections();
  const creditSalesQ = useCreditSales();
  const vehiclesQ = useAllVehicles(false);
  const receivablesQ = useReceivables(stationId, {
    enabled: !!stationId && canReadReceivables,
  });
  // The tabs read receivables only when the Role may (`null` otherwise), and
  // only a well-formed summary.
  const summary = Array.isArray(receivablesQ.data?.customers) ? receivablesQ.data : undefined;
  const receivables = canReadReceivables ? { ...receivablesQ, data: summary } : null;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const runTask = useRunTask();

  const allCustomers = useMemo(() => customersAllQ.data ?? [], [customersAllQ.data]);
  const fuelProducts = (productsQ.data ?? []).filter(
    (p: any) => p.productType === 'FUEL' && p.isActive,
  );

  // Station clock. Credit sales sit on a Business Day (Day Start applies);
  // collections are office records dated by the plain calendar date (ADR 0005).
  const stationSettings: any = selectedStation?.settings || {};
  const timeZone: string | undefined = stationSettings.timezone;
  const dayStartsAt: string | undefined = stationSettings.business_day_starts_at;
  const clock = useMemo(() => ({ timeZone, dayStartsAt }), [timeZone, dayStartsAt]);
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);

  const eligibleCustomers = allCustomers.filter(
    (c: any) => c.customerType === 'Credit' || c.customerType === 'Fleet',
  );

  // --- Customer form drawer ---
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const openCreateCustomer = () => {
    consumeIntent();
    setEditingCustomer(null);
    setCustomerDrawerOpen(true);
  };
  const openEditCustomer = (cust: any) => {
    consumeIntent();
    setEditingCustomer(cust);
    setCustomerDrawerOpen(true);
  };

  // --- Statement drawer ---
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null);

  // --- Vehicle drawer ---
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  const openCreateVehicle = () => {
    setEditingVehicle(null);
    setIsVehicleDrawerOpen(true);
  };
  const openEditVehicle = (v: any) => {
    setEditingVehicle(v);
    setIsVehicleDrawerOpen(true);
  };
  const onDeleteVehicle = async (vehicle: any) => {
    if (
      !(await confirm({
        title: 'Delete vehicle?',
        message: `This will remove vehicle ${vehicle.registrationNumber}.`,
        confirmLabel: 'Delete',
        danger: true,
      }))
    )
      return;
    try {
      await transactionService.deleteCustomerVehicle(vehicle.id);
      toast.success('Vehicle deleted.');
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete vehicle');
    }
  };

  // The "add vehicle" drawer defaults to the first eligible customer. Nothing
  // else ever set this, so it was only ever a derived value held in state and
  // filled in one render late.
  const vehicleCustomerId = eligibleCustomers[0]?.id ?? '';

  // A collection opens the shared Office Record drawer (#526); from a
  // statement the customer is fixed.
  const openCollectionDrawer = (customer?: any) => {
    if (customer) {
      // The statement stays open under the drawer.
      openQuickEntry('collection', { origin: 'statement', party: customer });
      return;
    }
    consumeIntent();
    openQuickEntry('collection', { origin: 'page' });
  };

  // --- deep-link intent (from global search / quick-create) ---
  // Everything below is derived from the pending intent rather than copied into
  // state by an effect. That removes the old race: the effect bailed out while
  // `customersAllQ` was loading and relied on re-running once the data landed,
  // so a deep link could be swallowed. A derivation simply resolves later.
  const intent = useNavIntent();
  const focusCustomerId = intent?.focusCustomerId ?? null;
  const activeTab: TabType = focusCustomerId ? 'registry' : selectedTab;
  const statementCustomer = focusCustomerId
    ? (allCustomers.find((c: any) => c.id === focusCustomerId) ?? null)
    : (allCustomers.find((c: any) => c.id === statementCustomerId) ?? null);

  // `open: 'new-customer'` arrives from the quick-create menu and the command
  // palette. `CustomerFormDrawer` seeds its own defaults, so opening it by
  // derivation is safe here in a way it would not be for an entry drawer.
  const isCustomerDrawerOpen = intent?.open === 'new-customer' || customerDrawerOpen;
  const closeCustomerDrawer = () => {
    consumeIntent();
    setCustomerDrawerOpen(false);
  };

  const setActiveTab = (tab: TabType) => {
    clearNavIntent();
    setSelectedTab(tab);
  };
  /**
   * Any setter that competes with a derived intent value must also drop the
   * intent, or the deep link silently out-votes the operator — clicking a row
   * while a focus intent is pending would otherwise do nothing on screen.
   */
  const showStatementFor = (id: string | null) => {
    consumeIntent();
    setStatementCustomerId(id);
  };
  const closeStatement = () => showStatementFor(null);

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">
        Please select a station to view customer accounts.
      </p>
    );
  }

  return (
    <>
      <PageFrame
        route={ROUTES.customers}
        subtitle="Credit customers, their sales and collections."
        actions={
          <>
            {activeTab === 'transactions' && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={() => openCollectionDrawer()}
              >
                Record collection
              </Button>
            )}
            {activeTab === 'registry' && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                onClick={openCreateCustomer}
              >
                Add customer
              </Button>
            )}
            {activeTab === 'vehicles' && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Icon name="plus" size="sm" />}
                disabled={eligibleCustomers.length === 0}
                onClick={openCreateVehicle}
              >
                Add vehicle
              </Button>
            )}
          </>
        }
        tabs={
          <Tabs
            id={TABS_ID}
            aria-label="Customers"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={[
              { id: 'registry', label: 'Customers', concept: 'customers' },
              { id: 'sales', label: 'Credit sales', concept: 'credit-sales' },
              { id: 'transactions', label: 'Collections', concept: 'collections' },
              { id: 'vehicles', label: 'Vehicles', concept: 'vehicles' },
            ]}
          />
        }
      >
        <div {...tabPanelProps(TABS_ID, activeTab)}>
          {activeTab === 'registry' && (
            <CustomerListTab
              customersQ={customersAllQ}
              receivablesQ={receivables}
              collectionsQ={collectionsQ}
              entryClock={entryClock}
              onOpenStatement={(c) => showStatementFor(c.id)}
              onEdit={openEditCustomer}
            />
          )}
          {activeTab === 'sales' && (
            <CreditSalesTab creditSalesQ={creditSalesQ} receivablesQ={receivables} clock={clock} />
          )}
          {activeTab === 'transactions' && (
            <CollectionsTab
              collectionsQ={collectionsQ}
              receivablesQ={receivables}
              entryClock={entryClock}
            />
          )}
          {activeTab === 'vehicles' && (
            <VehiclesTab
              vehiclesQ={vehiclesQ}
              onEdit={openEditVehicle}
              onDelete={(v) => runTask(onDeleteVehicle(v), 'Could not delete the vehicle.')}
            />
          )}
        </div>
      </PageFrame>

      <CustomerFormDrawer
        isOpen={isCustomerDrawerOpen}
        editingCustomer={editingCustomer}
        stationId={stationId}
        userRole={userRole}
        onClose={closeCustomerDrawer}
      />

      <StatementDrawer
        customer={statementCustomer}
        stationId={stationId}
        clock={clock}
        receivables={summary}
        onClose={closeStatement}
        onEdit={(c) => {
          closeStatement();
          openEditCustomer(c);
        }}
        onRecordCollection={(c) => openCollectionDrawer(c)}
      />

      <VehicleDrawer
        isOpen={isVehicleDrawerOpen}
        editingVehicle={editingVehicle}
        defaultCustomerId={vehicleCustomerId}
        eligibleCustomers={eligibleCustomers}
        fuelProducts={fuelProducts}
        onClose={() => setIsVehicleDrawerOpen(false)}
      />
    </>
  );
};
