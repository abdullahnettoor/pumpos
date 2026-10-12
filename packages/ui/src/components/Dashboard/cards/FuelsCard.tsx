import React, { useMemo } from 'react';
import {
  canRecordDensityFromDashboard,
  canSeeDashboardCard,
  resolveDecantationSettings,
} from '@pump/shared';
import { DashboardCard } from '../frame/DashboardCard.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import {
  useDecantations,
  useDensityTodaySummary,
  useInventoryStatus,
  usePricing,
} from '../../../query/hooks.js';
import { FuelBlock, type Part } from './fuels/FuelBlock.js';
import {
  deriveDensityState,
  derivePendingDecant,
  deriveFuelTanks,
  type DensityState,
  type FuelTank,
  type InventoryTankRow,
} from './fuels/fuelsModel.js';

/**
 * Fuels column card: one block per fuel (price, density at 15 °C, tanks with
 * days of cover, pending Decantation). Price drives the card; density and
 * tanks load independently inside each block.
 */
export const FuelsCard: React.FC = () => {
  const { station, role, businessDate, timeZone, onNavigate } = useDashboard();
  const enabled = useCardEnabled('fuels');
  const pricingQ = usePricing(station.id, { enabled });
  const densityQ = useDensityTodaySummary(station.id, businessDate, { enabled });
  const inventoryQ = useInventoryStatus(station.id, { enabled });

  const canPlanDecant = canSeeDashboardCard('planPurchaseDecant', role);
  const decantsQ = useDecantations(station.id, 'PENDING_MEASUREMENT', {
    enabled: enabled && canPlanDecant,
  });
  const tolerance = useMemo(
    () => resolveDecantationSettings(station.settings).densityToleranceKgM3,
    [station.settings],
  );
  const canRecord = canRecordDensityFromDashboard(role);

  const fuels = (pricingQ.data ?? []) as Array<{
    productId: string;
    productName: string;
    productCode: string;
    price: number;
    effectiveFrom: string | null;
  }>;

  return (
    <DashboardCard
      card="fuels"
      title="Fuels"
      variant="plain"
      query={pricingQ}
      placeholderHeight={320}
    >
      <div className="flex flex-col gap-3">
        {fuels.length === 0 && <p className="text-[12.5px] text-ink-muted">No fuels set up yet.</p>}
        {fuels.map((f) => {
          const density: Part<{ state: DensityState; trend: number[] }> = densityQ.isError
            ? { status: 'error', retry: () => void densityQ.refetch() }
            : densityQ.data
              ? {
                  status: 'ready',
                  value: (() => {
                    const p = densityQ.data.products.find((x) => x.productId === f.productId);
                    return {
                      state: deriveDensityState(p, businessDate, tolerance),
                      trend: p?.trendValues ?? [],
                    };
                  })(),
                }
              : { status: 'loading' };
          const tanks: Part<FuelTank[]> = inventoryQ.isError
            ? { status: 'error', retry: () => void inventoryQ.refetch() }
            : inventoryQ.data
              ? {
                  status: 'ready',
                  value: deriveFuelTanks(inventoryQ.data as InventoryTankRow[], f.productId),
                }
              : { status: 'loading' };
          return (
            <FuelBlock
              key={f.productId}
              name={f.productName}
              code={f.productCode}
              price={Number(f.price) || 0}
              effectiveFrom={f.effectiveFrom}
              density={density}
              tanks={tanks}
              pendingDecant={
                canPlanDecant ? derivePendingDecant(decantsQ.data ?? [], f.productId) : null
              }
              timeZone={timeZone}
              businessDate={businessDate}
              canRecord={canRecord}
              canDecant={canPlanDecant}
              canPlan={canPlanDecant}
              onRecord={() => onNavigate('/inventory', { focusInventoryTab: 'density' })}
              onDecant={() => onNavigate('/inventory', { focusInventoryTab: 'decantations' })}
              onPlan={() => onNavigate('/purchases', { openNewPurchase: true })}
            />
          );
        })}
      </div>
    </DashboardCard>
  );
};
