import React from 'react';
import { percent } from '../../lib/insights/format.js';
import { StatusBadge } from '../../ui/index.js';

/**
 * Change of the per-day average vs the prior period as a badge. A null change
 * (the periods are not comparable) shows none: the caller explains why.
 */
export const ChangeBadge: React.FC<{ changePct: number | null; days: number }> = ({
  changePct,
  days,
}) => {
  if (changePct === null) return null;
  const up = changePct >= 0;
  return (
    <StatusBadge tone={up ? 'good' : 'bad'}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'Up' : 'Down'}</span> {percent(changePct)} vs prior {days}
    </StatusBadge>
  );
};
