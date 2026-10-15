import React, { useEffect, useMemo, useRef, useState } from 'react';
import { canRecordDecantation, type Role } from '@pump/shared';
import { useNavIntent, clearNavIntent } from '../nav-intent/store.js';
import { ROUTES } from '../nav-intent/routes.js';
import { Button, Icon, Tabs, tabPanelProps, type TabItem } from '../pump-ds/index.js';
import { CloudTransactionService } from '../services/cloud.js';
import {
  useInventoryStatus,
  useInventoryItems,
  useInventoryMovements,
  useInventoryVariances,
  useTankLevelSettings,
  useInvalidateOperational,
} from '../query/hooks.js';
import { PageFrame } from './page-frame/index.js';
import { Banner } from './primitives/Banner.js';
import { DensityTab } from './inventory/density/index.js';
import { DecantationsTab } from './inventory/decantation/DecantationsTab.js';
import { InventoryTiles } from './inventory/InventoryTiles.js';
import { TanksView } from './inventory/TanksView.js';
import { ProductStockView } from './inventory/ProductStockView.js';
import { MovementsView } from './inventory/MovementsView.js';
import { ReconciliationsView } from './inventory/ReconciliationsView.js';
import { StockCountDrawer, type CountScope } from './inventory/StockCountDrawer.js';
import type { ItemRow, TankRow } from './inventory/inventoryFigures.js';
import {
  isAmbiguousMutationError,
  loadPendingStockCountRequest,
  resolveStockCountRequestIdentity,
  savePendingStockCountRequest,
  type StockCountRequestIdentity,
} from '../query/stockCountMutation.js';

const transactionService = new CloudTransactionService();

interface InventoryListProps {
  selectedStation: any | null;
  /** Gates the Decantations tab (Owner, Manager, Accountant) and the Owner review banner. */
  userRole?: Role | null;
}

type TabType = 'tanks' | 'density' | 'items' | 'movements' | 'variances' | 'decantations';

const TABS_ID = 'inventory';

/**
 * The Inventory page (#536): Tanks · Decantations · Density · Product stock ·
 * Movements · Reconciliations, on the Page Frame. The four stock tiles sit on
 * top of every tab (owner decision); each tab's list carries its own controls
 * in its section header (layout B, #567), and every region loads in its own
 * Data Section. "Reconcile stock" is the one primary action.
 */
export const InventoryList: React.FC<InventoryListProps> = ({ selectedStation, userRole }) => {
  const [selectedTab, setSelectedTab] = useState<TabType>('tanks');
  const stationId = selectedStation?.id ?? null;
  const invalidateOperational = useInvalidateOperational();

  const tanksQ = useInventoryStatus(stationId);
  const itemsQ = useInventoryItems(stationId);
  const movementsQ = useInventoryMovements(stationId);
  const variancesQ = useInventoryVariances(stationId);
  const tankLevels = useTankLevelSettings(stationId);

  // A movement and a stock count sit on a Business Day: the full station clock.
  const timeZone = selectedStation?.settings?.timezone;
  const dayStartsAt = selectedStation?.settings?.business_day_starts_at;
  const clock = useMemo(() => ({ timeZone, dayStartsAt }), [timeZone, dayStartsAt]);

  // Deep-link focus (from a dashboard/bell stock alert): switch to the target
  // tab and highlight the offending tank card / merchandise row. Derived from
  // the intent rather than copied into state by an effect, so the deep link
  // wins until the operator picks a different tab, which clears it.
  const intent = useNavIntent();
  const showDecantations = !!userRole && canRecordDecantation(userRole);
  // A deep link to a tab this role cannot see falls back to the chosen tab.
  const requestedTab = intent?.focusInventoryTab ?? null;
  const focusTab = requestedTab === 'decantations' && !showDecantations ? null : requestedTab;
  const activeTab = focusTab ?? selectedTab;
  const highlightId = focusTab ? (intent?.focusInventoryId ?? null) : null;

  const setActiveTab = (tab: TabType) => {
    clearNavIntent();
    setSelectedTab(tab);
  };

  // Fade the highlight after a few seconds. The intent carries two different
  // lifetimes — the highlight is transient, the tab selection is not — so the
  // durable half is committed to local state before the intent is dropped.
  // Clearing alone would snap the operator back to the previous tab mid-use.
  useEffect(() => {
    if (!focusTab) return;
    const t = setTimeout(() => {
      setSelectedTab(focusTab);
      clearNavIntent();
    }, 4000);
    return () => clearTimeout(t);
  }, [focusTab]);

  // Stock count / opening balance / adjustment
  const [countOpen, setCountOpen] = useState(false);
  const [countScope, setCountScope] = useState<CountScope>('item');
  const [countTargetId, setCountTargetId] = useState('');
  const [countActual, setCountActual] = useState('');
  const [countReason, setCountReason] = useState('');
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [countNotice, setCountNotice] = useState<string[]>([]);
  const countRequestRef = useRef<StockCountRequestIdentity | null>(loadPendingStockCountRequest());

  const items = useMemo<ItemRow[]>(() => itemsQ.data ?? [], [itemsQ.data]);
  const tanks = useMemo<TankRow[]>(() => tanksQ.data ?? [], [tanksQ.data]);

  const firstTarget = (scope: CountScope) =>
    scope === 'item' ? (items[0]?.productId ?? '') : (tanks[0]?.id ?? '');

  const openCount = (scope: CountScope) => {
    setCountScope(scope);
    setCountTargetId(firstTarget(scope));
    setCountActual('');
    setCountReason('');
    setCountError(null);
    setCountNotice([]);
    setCountOpen(true);
  };

  const changeCountScope = (scope: CountScope) => {
    setCountScope(scope);
    setCountTargetId(firstTarget(scope));
  };

  const submitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationId || !countTargetId || countActual === '') return;
    try {
      setCountSubmitting(true);
      setCountError(null);
      let productId = countTargetId;
      let tankId: string | null = null;
      if (countScope === 'tank') {
        const tank = tanks.find((t) => t.id === countTargetId);
        productId = tank?.productId ?? '';
        tankId = countTargetId;
      }
      const payload = {
        stationId,
        ...(tankId ? {} : { productId }),
        actualQuantity: Number(countActual),
        tankId,
        reason: countReason || undefined,
      };
      countRequestRef.current = resolveStockCountRequestIdentity(countRequestRef.current, payload);
      savePendingStockCountRequest({ ...countRequestRef.current, payload });
      const counted = await transactionService.recordStockCount(payload, {
        idempotencyKey: countRequestRef.current.idempotencyKey,
      });
      countRequestRef.current = null;
      savePendingStockCountRequest(null);
      setCountNotice((counted.warnings ?? []).map((w) => w.message));
      setCountOpen(false);
      await invalidateOperational(stationId);
    } catch (err: any) {
      if (!isAmbiguousMutationError(err)) {
        countRequestRef.current = null;
        savePendingStockCountRequest(null);
      }
      setCountError(err.message || 'Failed to record stock count');
    } finally {
      setCountSubmitting(false);
    }
  };

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">Please select a station to view inventory.</p>
    );
  }

  const tabs: TabItem[] = [
    { id: 'tanks', label: 'Tanks', concept: 'tanks' },
    ...(showDecantations
      ? [{ id: 'decantations', label: 'Decantations', concept: 'decantations' } satisfies TabItem]
      : []),
    { id: 'density', label: 'Density', concept: 'density' },
    { id: 'items', label: 'Product stock', concept: 'product-stock' },
    { id: 'movements', label: 'Movements', concept: 'movements' },
    { id: 'variances', label: 'Reconciliations', concept: 'reconciliations' },
  ];

  return (
    <>
      <PageFrame
        route={ROUTES.inventory}
        subtitle="Tank levels, product stock, density, decantations and every stock movement."
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Icon name="clipboard-check" size="sm" />}
            onClick={() => openCount(activeTab === 'tanks' ? 'tank' : 'item')}
          >
            Reconcile stock
          </Button>
        }
        tabs={
          <Tabs
            id={TABS_ID}
            aria-label="Inventory views"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={tabs}
          />
        }
      >
        <div {...tabPanelProps(TABS_ID, activeTab)} className="flex flex-col gap-4">
          {countNotice.length > 0 && (
            <Banner severity="warning" dismissible onDismiss={() => setCountNotice([])}>
              {countNotice.join(' ')}
            </Banner>
          )}
          <InventoryTiles tanksQ={tanksQ} itemsQ={itemsQ} tankLevels={tankLevels} />

          {activeTab === 'tanks' && (
            <TanksView tanksQ={tanksQ} tankLevels={tankLevels} highlightId={highlightId} />
          )}
          {activeTab === 'decantations' && showDecantations && (
            <DecantationsTab station={selectedStation} userRole={userRole} clock={clock} />
          )}
          {activeTab === 'density' && <DensityTab stationId={stationId} />}
          {activeTab === 'items' && <ProductStockView itemsQ={itemsQ} highlightId={highlightId} />}
          {activeTab === 'movements' && <MovementsView movementsQ={movementsQ} clock={clock} />}
          {activeTab === 'variances' && (
            <ReconciliationsView variancesQ={variancesQ} clock={clock} />
          )}
        </div>
      </PageFrame>

      <StockCountDrawer
        isOpen={countOpen}
        onClose={() => setCountOpen(false)}
        scope={countScope}
        onScopeChange={changeCountScope}
        targetId={countTargetId}
        onTargetChange={setCountTargetId}
        actual={countActual}
        onActualChange={setCountActual}
        reason={countReason}
        onReasonChange={setCountReason}
        items={items}
        tanks={tanks}
        submitting={countSubmitting}
        error={countError}
        onSubmit={submitCount}
      />
    </>
  );
};
