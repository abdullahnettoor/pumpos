import React from 'react';
import { rupees } from '../../lib/format.js';
import type { PaymentSlice } from '../../lib/shifts/summary.js';

const SWATCH: Record<PaymentSlice['key'], string> = {
  cash: 'bg-accent',
  upi: 'bg-info',
  card: 'bg-text-muted',
  credit: 'bg-warn',
};

/** Stacked bar plus one amount per payment method. A colour is always paired with its name. */
export const PaymentSplit: React.FC<{ slices: readonly PaymentSlice[] }> = ({ slices }) => {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="mx-3 rounded-[14px] border border-line bg-card p-3">
      {total > 0 && (
        <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {slices
            .filter((s) => s.amount > 0)
            .map((s) => (
              <div key={s.key} className={SWATCH[s.key]} style={{ flex: s.amount }} />
            ))}
        </div>
      )}
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-2 ${total > 0 ? 'mt-2.5' : ''}`}>
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
    </div>
  );
};
