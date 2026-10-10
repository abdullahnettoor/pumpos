import React from 'react';
import { Combobox, inr } from '@pump/ui';
import { num } from '../../lib/num.js';
import type { MerchRow } from '../../lib/handover/model.js';
import { AddButton, NumberField } from './Fields.js';
import { TrashIcon } from './icons.js';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

/** One step of the stepper: never below zero, blank (not "0") at zero. */
const stepQuantity = (current: string, delta: 1 | -1): string => {
  const next = Math.max(0, Number((num(current) + delta).toFixed(3)));
  return next > 0 ? String(next) : '';
};

const StepperButton: React.FC<{ label: string; onClick: () => void; children: string }> = ({
  label,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="hit-44 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-line-strong bg-card text-lg font-semibold text-text-high"
  >
    {children}
  </button>
);

/**
 * Product lines for the handover's "Products sold" step: pick a product, then
 * − / + (or type) the quantity. Presentational; the panel owns the rows.
 */
export const ProductsFields: React.FC<{
  rows: MerchRow[];
  options: Option[];
  productById: Record<string, any>;
  nonCash: string;
  total: number;
  onRowsChange: (rows: MerchRow[]) => void;
  onNonCashChange: (value: string) => void;
}> = ({ rows, options, productById, nonCash, total, onRowsChange, onNonCashChange }) => {
  const patch = (idx: number, change: Partial<MerchRow>) =>
    onRowsChange(rows.map((r, i) => (i === idx ? { ...r, ...change } : r)));

  return (
    <>
      <ul className="flex flex-col gap-2">
        {rows.map((row, idx) => {
          const p = productById[row.productId];
          const mrp = p?.sellingPrice != null ? Number(p.sellingPrice) : null;
          const lineTotal = mrp != null ? mrp * num(row.quantity) : null;
          return (
            <li
              key={idx}
              className="flex flex-col gap-2 rounded-xl border border-line bg-card-alt p-2.5"
            >
              <Combobox
                options={options}
                value={row.productId}
                onChange={(v) => patch(idx, { productId: v })}
                placeholder="Select product…"
                searchPlaceholder="Search product…"
              />
              <div className="flex items-center gap-2">
                <p className="num min-w-0 flex-1 truncate text-[11px] text-text-muted">
                  {mrp != null
                    ? `MRP ${inr(mrp)}${lineTotal ? ` · ${inr(lineTotal)}` : ''}`
                    : p?.unit
                      ? `Qty in ${p.unit}`
                      : ''}
                </p>
                <StepperButton
                  label="Decrease quantity"
                  onClick={() => patch(idx, { quantity: stepQuantity(row.quantity, -1) })}
                >
                  −
                </StepperButton>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={row.quantity}
                  placeholder="0"
                  aria-label="Quantity"
                  onChange={(e) => patch(idx, { quantity: e.target.value })}
                  className="num h-9 w-14 flex-shrink-0 rounded-xl border border-line-strong bg-card text-center text-[15px] font-semibold text-text-high focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20"
                />
                <StepperButton
                  label="Increase quantity"
                  onClick={() => patch(idx, { quantity: stepQuantity(row.quantity, 1) })}
                >
                  +
                </StepperButton>
                <button
                  type="button"
                  onClick={() =>
                    onRowsChange(
                      rows.length > 1
                        ? rows.filter((_, i) => i !== idx)
                        : [{ productId: '', quantity: '' }],
                    )
                  }
                  className="hit-44 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-line text-bad-fg"
                  aria-label="Remove item"
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <AddButton onClick={() => onRowsChange([...rows, { productId: '', quantity: '' }])}>
        + Add product
      </AddButton>

      <NumberField
        label="Paid by card / UPI (₹, optional)"
        value={nonCash}
        onChange={onNonCashChange}
        meta={total > 0 ? `of ${inr(total)}` : undefined}
        sub="Portion of products not collected as cash"
      />
    </>
  );
};
