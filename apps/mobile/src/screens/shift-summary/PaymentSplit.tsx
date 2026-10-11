import React from 'react';
import { rupees } from '../../lib/format.js';
import type { PaymentSplitView, PaymentSlice } from '../../lib/shifts/summary.js';
import { TONE_TEXT } from '../../ui/tones.js';

const SWATCH: Record<PaymentSlice['key'], string> = {
  cash: 'bg-accent',
  upi: 'bg-info',
  card: 'bg-text-muted',
  credit: 'bg-warn',
  omc: 'bg-chart-3',
};

/**
 * Stacked bar plus one amount per payment method. A colour is always paired with
 * its name. The attendant variance is its own line (no bar segment: it is not a
 * payment method), and Total sales closes the list when everything adds up to it.
 */
export const PaymentSplit: React.FC<{ split: PaymentSplitView }> = ({ split }) => {
  const { slices, gap, total } = split;
  const paid = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="mx-3 rounded-[14px] border border-line bg-card p-3">
      {paid > 0 && (
        <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {slices
            .filter((s) => s.amount > 0)
            .map((s) => (
              <div key={s.key} className={SWATCH[s.key]} style={{ flex: s.amount }} />
            ))}
        </div>
      )}
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-2 ${paid > 0 ? 'mt-2.5' : ''}`}>
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              aria-hidden="true"
              className={`h-2 w-2 flex-shrink-0 rounded-[3px] ${SWATCH[s.key]}`}
            />
            <dt>{s.label}</dt>
            <dd className="num ml-auto font-semibold text-text-high">{rupees(s.amount)}</dd>
          </div>
        ))}
      </dl>
      {(gap || total !== null) && (
        <dl className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-xs">
          {gap && (
            <div>
              <div className={`flex items-center gap-1.5 ${TONE_TEXT[gap.tone]}`}>
                <dt className="font-semibold">{gap.label}</dt>
                <dd className="num ml-auto font-semibold">{rupees(gap.amount)}</dd>
              </div>
              <p className="text-[11px] text-text-muted">{gap.note}</p>
            </div>
          )}
          {total !== null && (
            <div className="flex items-center gap-1.5 text-text-muted">
              <dt>Total sales</dt>
              <dd className="num ml-auto font-semibold text-text-high">{rupees(total)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
};
