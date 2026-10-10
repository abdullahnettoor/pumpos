import React from 'react';
import type { HomeTiles } from '../lib/home/figures.js';
import { compactRupees, signedRupees } from '../lib/format.js';
import { StatTile } from '../ui/index.js';

/**
 * A Business Day's four tiles: cash variance, gross margin, Credit Sales and
 * Purchases. Shared by Home and the DSSR page; renders into the caller's
 * two-column grid, from `deriveTiles` over the day's DSSR payload.
 */
export const DayTiles: React.FC<{ tiles: HomeTiles }> = ({ tiles: t }) => (
  <>
    <StatTile
      label="Cash variance"
      value={t.variance.value === null ? '—' : signedRupees(t.variance.value)}
      sub={t.variance.detail}
      note={t.variance.secondary}
      tone={t.variance.tone}
    />
    <StatTile
      label="Gross margin"
      value={t.margin.value === null ? '—' : compactRupees(t.margin.value)}
      sub={t.margin.detail}
      tone={t.margin.tone}
    />
    <StatTile
      label="Credit sales"
      value={compactRupees(t.credit.value ?? 0)}
      sub={t.credit.detail}
      tone={t.credit.tone}
    />
    <StatTile
      label="Purchases"
      value={compactRupees(t.purchases.value ?? 0)}
      sub={t.purchases.detail}
      tone={t.purchases.tone}
    />
  </>
);
