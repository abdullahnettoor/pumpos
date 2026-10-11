import React from 'react';
import type { Tile } from '../../lib/money/receivables.js';
import { StatTile } from '../../ui/StatTile.js';

export interface TileSpec {
  tile: Tile;
  tone?: 'good' | 'warn';
}

/**
 * A two-column grid of `StatTile`s under a party's balance card (how a Customer
 * pays, what a Supplier was paid and sold this month). A spec that is `null` (no
 * data for it) is left out rather than shown as a zero.
 */
export const TileGrid: React.FC<{
  label: string;
  tiles: ReadonlyArray<TileSpec | null | false>;
}> = ({ label, tiles }) => (
  <div aria-label={label} role="group" className="mt-2 grid grid-cols-2 gap-2 px-3">
    {tiles.map(
      (t) =>
        t && (
          <StatTile
            key={t.tile.label}
            label={t.tile.label}
            value={t.tile.value}
            sub={t.tile.sub}
            tone={t.tone}
          />
        ),
    )}
  </div>
);
