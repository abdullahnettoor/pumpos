import React from 'react';
import type { InsightsSales } from '@pump/shared';
import { compactRupees, percent } from '../../lib/insights/format.js';
import { ChangeBadge } from './SalesTrend.js';

const SWATCH = ['var(--accent)', 'var(--info)', 'var(--warn)', 'var(--good)', 'var(--text-muted)'];

export const ProductMix: React.FC<{ data: InsightsSales; days: number }> = ({ data, days }) => {
  const { productMix, otherProducts: o } = data;
  return (
    <div className="mx-3 rounded-[14px] border border-line bg-card p-3">
      {productMix.length > 0 && (
        <>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {productMix.map((p, i) => (
              <div
                key={p.productCode}
                style={{ flex: p.litres, background: SWATCH[i % SWATCH.length] }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-text-muted">
            {productMix.map((p, i) => (
              <li key={p.productCode}>
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2 w-2 rounded-[3px]"
                  style={{ background: SWATCH[i % SWATCH.length] }}
                />
                {p.productCode}{' '}
                <b className="num font-semibold text-text-high">{percent(p.share)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <div
        className={`flex items-center justify-between ${productMix.length > 0 ? 'mt-3 border-t border-line pt-2.5' : ''}`}
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
              Top: {o.top.name} · {Math.round(o.top.quantity)} units
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
