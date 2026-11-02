import React from 'react';
import { formatMoney } from '../../utils/format.js';
import type { NatureTotals } from './natureTotals.js';

/**
 * Direct, Indirect and Grand total of the entries above it. A plain line, not
 * a fifth KPI tile: the tile strip is fixed at four (#567).
 */
export const NatureTotalsBar: React.FC<{ totals: NatureTotals }> = ({ totals }) => (
  <dl
    aria-label="Totals by type"
    className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 px-1 text-[13px]"
  >
    {(
      [
        ['Direct', totals.direct],
        ['Indirect', totals.indirect],
        ['Grand total', totals.grand],
      ] as const
    ).map(([label, value]) => (
      <div key={label} className="flex items-baseline gap-1.5">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="font-mono text-ink-strong tabular-nums">{formatMoney(value)}</dd>
      </div>
    ))}
  </dl>
);
