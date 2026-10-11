import React from 'react';
import type { SupplierPayableSummary } from '@pump/shared';
import { monthCaption, paidThisMonthTile, purchasedTile } from '../../lib/money/payables.js';
import { TileGrid } from './TileGrid.js';

/** Purchased vs paid this month, with the litres that came in and the last payment (date, method). */
export const SupplierMonthTiles: React.FC<{ summary: SupplierPayableSummary }> = ({ summary }) => {
  const caption = monthCaption(summary.month);
  return (
    <>
      <TileGrid
        label="This month"
        tiles={[
          { tile: purchasedTile(summary.month) },
          { tile: paidThisMonthTile(summary.month, summary.lastPayment), tone: 'good' },
        ]}
      />
      {caption && <p className="mt-1.5 px-4 text-[11px] text-text-muted">{caption}</p>}
    </>
  );
};
