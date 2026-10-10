import React from 'react';
import type { SupplierPayableSummary } from '@pump/shared';
import { paidThisMonthTile, purchasedTile } from '../../lib/money/payables.js';
import { TileGrid } from './TileGrid.js';

/** Purchased vs paid this month, with the litres that came in and the last payment (date, method). */
export const SupplierMonthTiles: React.FC<{ summary: SupplierPayableSummary }> = ({ summary }) => (
  <TileGrid
    label="This month"
    tiles={[
      { tile: purchasedTile(summary.month) },
      { tile: paidThisMonthTile(summary.month, summary.lastPayment), tone: 'good' },
    ]}
  />
);
