import React from 'react';
import { can, type Principal } from '@pump/shared';
import type { HomeTiles } from '../lib/home/figures.js';
import { compactRupees } from '../lib/format.js';
import { StatTile } from '../ui/index.js';
import { CashVarianceCard } from './CashVarianceCard.js';

/**
 * A Business Day's tiles (margin and purchases only with View margin / View purchase prices / costs): cash variance (both levels), gross margin, Credit Sales and
 * Purchases. Shared by Home and the DSSR page; renders into the caller's
 * two-column grid, from `deriveTiles` over the day's DSSR payload.
 */
export const DayTiles: React.FC<{ tiles: HomeTiles; principal: Principal }> = ({
  tiles: t,
  principal,
}) => (
  <>
    <CashVarianceCard variance={t.variance} />
    {can(principal, 'finance.viewMargin') && (
      <StatTile
        label="Gross margin"
        value={t.margin.value === null ? '—' : compactRupees(t.margin.value)}
        sub={t.margin.detail}
        tone={t.margin.tone}
      />
    )}
    <StatTile
      label="Credit sales"
      value={compactRupees(t.credit.value ?? 0)}
      sub={t.credit.detail}
      tone={t.credit.tone}
    />
    {can(principal, 'purchases.viewCosts') && (
      <StatTile
        label="Purchases"
        value={compactRupees(t.purchases.value ?? 0)}
        sub={t.purchases.detail}
        tone={t.purchases.tone}
      />
    )}
  </>
);
