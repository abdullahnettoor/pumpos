import React from 'react';
import type { InsightsSales } from '@pump/shared';
import { compactRupees, litres, signedRupees } from '../../lib/insights/format.js';

export const ShiftPerformance: React.FC<{ data: InsightsSales }> = ({ data }) => {
  const t = data.shiftTemplates;
  return (
    <div
      className="mx-3 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line"
      style={{ gridTemplateColumns: `repeat(${Math.min(t.length, 2)}, minmax(0, 1fr))` }}
    >
      {t.map((s) => (
        <div key={s.templateId ?? s.name} className="bg-card p-3">
          <p className="truncate text-[11px] font-medium text-text-muted">
            {s.name} · {s.shifts} {s.shifts === 1 ? 'shift' : 'shifts'}
          </p>
          <p className="num mt-1 text-lg font-semibold text-text-high">
            {compactRupees(s.avgSales)}
          </p>
          <p className="num text-[11px] text-text-muted">
            {litres(s.avgVolume)} · var{' '}
            <span
              className={
                s.avgCashVariance < -0.5
                  ? 'text-bad-fg'
                  : s.avgCashVariance > 0.5
                    ? 'text-warn-fg'
                    : 'text-good'
              }
            >
              {signedRupees(s.avgCashVariance)}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
};
