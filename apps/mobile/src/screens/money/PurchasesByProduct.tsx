import React from 'react';
import type { SupplierProductPurchase } from '@pump/shared';
import { productRows } from '../../lib/money/payables.js';
import { SectionLabel } from '../../ui/SectionLabel.js';

/**
 * Purchases by product · this month: what came in from this supplier, with its
 * quantity and value, largest value first as the API returns them. Not rendered
 * when nothing was bought this month (no empty section). Swatches use the
 * categorical chart tokens so a product keeps its colour in either theme.
 */
export const PurchasesByProduct: React.FC<{ products: readonly SupplierProductPurchase[] }> = ({
  products,
}) => {
  if (products.length === 0) return null;
  const rows = productRows(products);
  return (
    <section aria-label="Purchases by product this month">
      <SectionLabel>Purchases by product · this month</SectionLabel>
      <ul className="mx-3 list-none overflow-hidden rounded-[14px] border border-line bg-card [&>li+li]:border-t [&>li+li]:border-line">
        {rows.map((p, i) => (
          <li key={p.productId} className="flex items-center gap-2.5 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]"
              style={{ background: `var(--chart-${(i % 6) + 1})` }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-high">
              {p.name}
            </span>
            <span className="num text-[11.5px] text-text-muted">{p.quantity}</span>
            <span className="num min-w-[56px] text-right text-[13px] font-semibold text-text-high">
              {p.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
