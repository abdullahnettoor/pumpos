import React from 'react';
import type { CustomerReceivableSummary } from '@pump/shared';
import {
  creditTile,
  lastPaymentTile,
  paidTile,
  usuallyPaysTile,
  type Tile,
} from '../../lib/money/receivables.js';
import { StatTile } from '../../ui/StatTile.js';

const asTile = (t: Tile, tone?: 'good' | 'warn') => (
  <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} tone={tone} />
);

/**
 * How the customer pays: last payment, usually-pays-in, credit and paid this
 * month. A tile the API has no data for (no payment yet, fewer than 3 settled
 * sales) is left out, not shown as a zero.
 */
export const BehaviourTiles: React.FC<{ summary: CustomerReceivableSummary }> = ({ summary }) => {
  const last = lastPaymentTile(summary.lastPayment);
  const usual = usuallyPaysTile(summary.usuallyPaysInDays);
  const tiles = [
    last && asTile(last, 'good'),
    usual && asTile(usual),
    asTile(creditTile(summary.month), summary.month.credit > 0 ? 'warn' : undefined),
    asTile(paidTile(summary.month, summary.settlementCycle)),
  ].filter(Boolean);
  return (
    <div aria-label="Payment behaviour" role="group" className="mt-2 grid grid-cols-2 gap-2 px-3">
      {tiles}
    </div>
  );
};
