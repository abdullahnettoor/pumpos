import React from 'react';
import type { CustomerReceivableSummary } from '@pump/shared';
import {
  creditTile,
  lastPaymentTile,
  paidTile,
  usuallyPaysTile,
} from '../../lib/money/receivables.js';
import { TileGrid } from './TileGrid.js';

/**
 * How the customer pays: last payment, usually-pays-in, credit and paid this
 * month. A tile the API has no data for (no payment yet, fewer than 3 settled
 * sales) is left out, not shown as a zero.
 */
export const BehaviourTiles: React.FC<{ summary: CustomerReceivableSummary }> = ({ summary }) => {
  const last = lastPaymentTile(summary.lastPayment);
  const usual = usuallyPaysTile(summary.usuallyPaysInDays);
  return (
    <TileGrid
      label="Payment behaviour"
      tiles={[
        last && { tile: last, tone: 'good' },
        usual && { tile: usual },
        { tile: creditTile(summary.month), tone: summary.month.credit > 0 ? 'warn' : undefined },
        { tile: paidTile(summary.month, summary.settlementCycle) },
      ]}
    />
  );
};
