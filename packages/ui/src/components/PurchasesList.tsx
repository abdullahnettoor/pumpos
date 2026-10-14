import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveBusinessDate, resolveEntryDate } from '@pump/shared';
import { useNavIntent, clearNavIntent, type NavIntent } from '../nav-intent/store.js';
import { ROUTES } from '../nav-intent/routes.js';
import { usePayables, usePurchases, useSuppliers } from '../query/hooks.js';
import { openQuickEntry } from '../quick-entry/store.js';
import { Button, Icon, Tabs, tabPanelProps, type TabItem } from '../pump-ds/index.js';
import { PageFrame } from './page-frame/index.js';
import type { PurchaseLinkRow, PurchaseRow, SupplierRow } from './purchases/columns.js';
import { LinkToDecantationDrawer } from './purchases/LinkToDecantationDrawer.js';
import { PaymentsTab } from './purchases/PaymentsTab.js';
import { PurchaseDetailDrawer, type PurchaseDetail } from './purchases/PurchaseDetailDrawer.js';
import { PurchasesTab } from './purchases/PurchasesTab.js';
import { SupplierFormDrawer } from './purchases/SupplierFormDrawer.js';
import { SupplierStatementDrawer } from './purchases/SupplierStatementDrawer.js';
import { SuppliersTab } from './purchases/SuppliersTab.js';
import type { PurchaseClock } from './purchases/supplierFigures.js';

interface PurchasesListProps {
  selectedStation: any | null;
  /** Shell navigation, for the link to Reports → GST (purchase ITC lives there). */
  onNavigate?: (path: string, intent?: NavIntent) => void;
}

type TabType = 'registry' | 'transactions' | 'payments';

const TABS_ID = 'suppliers';
const TABS: TabItem[] = [
  { id: 'registry', label: 'Suppliers', concept: 'suppliers' },
  { id: 'transactions', label: 'Purchases', concept: 'purchases' },
  { id: 'payments', label: 'Payments', concept: 'payments' },
];

/**
 * The Suppliers page (#528, #540): Suppliers · Purchases · Payments. The
 * supplier list is a balance list and the other two are ledgers, all layout B
 * (#567): fixed tiles on top, each table's controls in its own header. Every
 * region loads in its own Data Section, so one failing request never blanks
 * the page. Recording opens the shared Office Record drawer (#526).
 */
export const PurchasesList: React.FC<PurchasesListProps> = ({ selectedStation, onNavigate }) => {
  const [selectedTab, setSelectedTab] = useState<TabType>('registry');
  // --- deep-link intent (from global search) ---
  // Derived, not copied into state by an effect: the old version bailed while
  // `suppliersQ` loaded and relied on re-running, so a deep link could be
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
  const suppliersQ = useSuppliers(false);
  // Payable and the month's purchased / paid: the server's payables summary,
  // the same figures the Dashboard and the mobile Money tab show.
  const payablesQ = usePayables(stationId);
  const allSuppliers = useMemo<SupplierRow[]>(() => suppliersQ.data ?? [], [suppliersQ.data]);

  // Office records are dated by entry date (station calendar); a Product
  // Purchase by its business day. Each "today" anchors its own kind (ADR 0005).
  const timeZone = selectedStation?.settings?.timezone;
  const dayStartsAt = selectedStation?.settings?.business_day_starts_at;
  const entryToday = resolveEntryDate({ timeZone });
  const businessToday = resolveBusinessDate({ timeZone, dayStartsAt });
  const clock = useMemo<PurchaseClock>(
    () => ({ entryToday, businessToday }),
    [entryToday, businessToday],
  );
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);

  const [detailPurchase, setDetailPurchase] = useState<PurchaseDetail | null>(null);

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
  const [linkingPurchase, setLinkingPurchase] = useState<PurchaseLinkRow | null>(null);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);
  const statementSupplier = focusSupplierId
    ? (allSuppliers.find((x) => x.id === focusSupplierId) ?? null)
    : (allSuppliers.find((x) => x.id === statementSupplierId) ?? null);
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
  const openEditSupplier = useCallback((sup: SupplierRow) => {
    setEditingSupplier(sup);
    setIsSupplierDrawerOpen(true);
  }, []);
  const openStatement = (s: SupplierRow) => showStatementFor(s.id);
  const openPurchase = useCallback((p: PurchaseRow) => setDetailPurchase(p), []);

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">Please select a station to view suppliers.</p>
    );
  }

  return (
    <>
      <PageFrame
        route={ROUTES.suppliers}
        subtitle="Supplier accounts, purchases and the payments that settle them."
        actions={
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
              leftIcon={<Icon name="plus" size="sm" />}
              onClick={openCreateSupplier}
            >
              Add supplier
            </Button>
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
              leftIcon={<Icon name="cart" size="sm" />}
              onClick={() => openPurchaseDrawer()}
            >
              Record purchase
            </Button>
          </>
        }
        tabs={
          <Tabs
            id={TABS_ID}
            aria-label="Suppliers"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={TABS}
          />
        }
      >
        <div {...tabPanelProps(TABS_ID, activeTab)} className="flex flex-col gap-4">
          {activeTab === 'registry' && (
            <SuppliersTab
              suppliersQ={suppliersQ}
              payablesQ={payablesQ}
              onOpenStatement={openStatement}
              onEdit={openEditSupplier}
            />
          )}
          {activeTab === 'transactions' && (
            <PurchasesTab
              purchasesQ={purchasesQ}
              payablesQ={payablesQ}
              clock={clock}
              entryClock={entryClock}
              onOpen={openPurchase}
              onLinkToDecantation={setLinkingPurchase}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsTab
              stationId={stationId}
              payablesQ={payablesQ}
              entryClock={entryClock}
              onOpenSupplier={(id) => showStatementFor(id)}
            />
          )}
        </div>
      </PageFrame>

      <LinkToDecantationDrawer
        purchase={linkingPurchase}
        onClose={() => setLinkingPurchase(null)}
      />

      <PurchaseDetailDrawer purchase={detailPurchase} onClose={() => setDetailPurchase(null)} />

      <SupplierFormDrawer
        isOpen={isSupplierDrawerOpen}
        editingSupplier={editingSupplier}
        stationId={stationId}
        onClose={() => setIsSupplierDrawerOpen(false)}
      />

      <SupplierStatementDrawer
        supplier={statementSupplier}
        stationId={stationId}
        clock={{ timeZone, dayStartsAt }}
        onClose={closeStatement}
        onEdit={(sup) => {
          closeStatement();
          openEditSupplier(sup);
        }}
        onNewPurchase={(sup) => openPurchaseDrawer(sup)}
      />
    </>
  );
};
