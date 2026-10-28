import React, { useMemo } from 'react';
import type { TankLevelSettings } from '@pump/shared';
import { KpiStrip, KpiTile, TileSection, type SectionQuery } from '../../pump-ds/index.js';
import {
  fuelStock,
  itemCounts,
  lowTanks,
  tankViews,
  type ItemRow,
  type TankRow,
} from './inventoryFigures.js';

interface Query<T> extends SectionQuery {
  data?: T;
}

export interface InventoryTilesProps {
  tanksQ: Query<TankRow[]>;
  itemsQ: Query<ItemRow[]>;
  tankLevels: TankLevelSettings;
}

/**
 * Inventory's four tiles (owner decision, #536): Fuel stock, Tanks low /
 * critical, Out of stock, Oversold. All read stock as it is now. Each sits in
 * its own Data Section with only the query it reads; colour only through
 * `alert`, only for a problem.
 */
export const InventoryTiles: React.FC<InventoryTilesProps> = ({ tanksQ, itemsQ, tankLevels }) => {
  const tanks = useMemo(() => tanksQ.data ?? [], [tanksQ.data]);
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const fuel = useMemo(() => fuelStock(tanks), [tanks]);
  const low = useMemo(() => lowTanks(tankViews(tanks, tankLevels)), [tanks, tankLevels]);
  const counts = useMemo(() => itemCounts(items), [items]);

  return (
    <KpiStrip columns="auto">
      <TileSection title="fuel stock" query={tanksQ}>
        <KpiTile label="Fuel stock" scope="now" value={fuel.value} hint={fuel.hint} />
      </TileSection>
      <TileSection title="tank levels" query={tanksQ}>
        <KpiTile
          label="Tanks low / critical"
          scope="now"
          value={String(low.count)}
          alert={low.critical > 0 ? 'danger' : low.count > 0 ? 'warning' : undefined}
          hint={
            low.critical > 0
              ? `${low.critical} critical · below ${tankLevels.criticalBelowPct}%`
              : `below ${tankLevels.lowBelowPct}% of capacity`
          }
        />
      </TileSection>
      <TileSection title="product stock" query={itemsQ}>
        <KpiTile
          label="Out of stock"
          scope="now"
          value={String(counts.outOfStock)}
          alert={counts.outOfStock > 0 ? 'warning' : undefined}
          hint="products with none on hand"
        />
      </TileSection>
      <TileSection title="product stock" query={itemsQ}>
        <KpiTile
          label="Oversold"
          scope="now"
          value={String(counts.oversold)}
          alert={counts.oversold > 0 ? 'danger' : undefined}
          hint="products sold below zero"
        />
      </TileSection>
    </KpiStrip>
  );
};
