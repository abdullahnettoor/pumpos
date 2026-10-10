import React from 'react';
import type { InsightsSales } from '@pump/shared';
import { compactRupees } from '../../lib/format.js';
import { percent } from '../../lib/insights/format.js';
import { ChangeBadge } from './ChangeBadge.js';

/** Categorical series (theme tokens; never the status colours). Cycles past six grades. */
const SERIES = [1, 2, 3, 4, 5, 6].map((n) => `var(--chart-${n})`);
const colour = (i: number) => SERIES[i % SERIES.length];

const kg = (n: number) => String(Number(n.toFixed(1))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const ProductMix: React.FC<{ data: InsightsSales; days: number }> = ({ data, days }) => {
  const { productMix, otherUnitFuels, otherProducts: o } = data;
  const hasFuel = productMix.length > 0 || otherUnitFuels.length > 0;
  const hasOther = o.total > 0 || o.top !== null;

  if (!hasFuel && !hasOther) {
    return (
      <p className="mx-3 rounded-[14px] border border-line bg-card px-3 py-5 text-center text-xs text-text-muted">
        No fuel or product sales in this range.
      </p>
    );
  }

  return (
    <div className="mx-3 rounded-[14px] border border-line bg-card p-3">
      {productMix.length > 0 && (
        <>
          {/* Decorative: the legend below carries every share as text. */}
          <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {productMix.map((p, i) => (
              <div key={p.productCode} style={{ flex: p.litres, background: colour(i) }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-text-muted">
            {productMix.map((p, i) => (
              <li key={p.productCode}>
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2 w-2 rounded-[3px]"
                  style={{ background: colour(i) }}
                />
                {p.productCode}{' '}
                <b className="num font-semibold text-text-high">{percent(p.share)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {productMix.length === 0 && (
        <p className="text-xs text-text-muted">No fuel sold by the litre in this range.</p>
      )}
      {otherUnitFuels.length > 0 && (
        <p className="mt-2 text-[11px] text-text-muted">
          Not in the litre mix:{' '}
          {otherUnitFuels.map((f, i) => (
            <span key={`${f.productCode}-${f.unit}`}>
              {i > 0 && ', '}
              {f.productCode}{' '}
              <b className="num font-semibold text-text-high">
                {kg(f.quantity)} {f.unit}
              </b>
            </span>
          ))}
        </p>
      )}
      {hasOther && (
        <div
          className={`flex items-center justify-between ${hasFuel ? 'mt-3 border-t border-line pt-2.5' : ''}`}
        >
          <div>
            <p className="text-[11px] font-medium text-text-muted">Lubes &amp; others</p>
            <p className="num mt-0.5 text-base font-semibold text-text-high">
              {compactRupees(o.total)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-text-muted">
            <ChangeBadge changePct={o.changePct} days={days} />
            {o.top && (
              <span>
                Top: {o.top.name} · {compactRupees(o.top.revenue)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
