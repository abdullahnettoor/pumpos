import React from 'react';
import { plural, rupees } from '../lib/home/format.js';
import type { FuelLine, ProductLine } from '../lib/home/sales.js';

/** Caption on a group header: which Shifts it covers, or "Live". */
export interface GroupNote {
  text: string;
  /** Marks the group as updating live (accent colour, leading dot). */
  live?: boolean;
}

interface Props {
  fuel: readonly FuelLine[];
  products: readonly ProductLine[];
  fuelNote: GroupNote;
  productsNote: GroupNote;
  /** Header of the non-fuel group. Product categories (#392) will replace the single group. */
  productsTitle?: string;
  /** Override the fuel / products totals when they are known more exactly than the line sums. */
  fuelTotal?: number;
  productsTotal?: number;
}

/** Fuel grades take these in turn; a swatch is colour plus the grade name beside it. */
const FUEL_SWATCH = ['bg-accent', 'bg-info', 'bg-warn', 'bg-good', 'bg-bad'] as const;
const swatchOf = (i: number) => FUEL_SWATCH[i % FUEL_SWATCH.length];

const sumOf = (xs: readonly { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);

const Note: React.FC<{ note: GroupNote }> = ({ note }) => (
  <span className={note.live ? 'normal-case tracking-normal text-accent' : ''}>
    {note.live && <span aria-hidden="true">● </span>}
    {note.text}
  </span>
);

const GroupHeader: React.FC<{ title: string; note: GroupNote }> = ({ title, note }) => (
  <div className="flex justify-between border-t border-line bg-card-alt px-3 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-text-faint">
    <span>{title}</span>
    <Note note={note} />
  </div>
);

const Row: React.FC<{
  swatch: string;
  name: React.ReactNode;
  quantity?: string;
  value: number;
}> = ({ swatch, name, quantity, value }) => (
  <div className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2.5 border-t border-line px-3 py-2.5 first:border-t-0">
    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${swatch}`} />
    <div className="min-w-0 truncate text-[13px] font-semibold text-text-high">{name}</div>
    <span className="num text-right text-[11.5px] text-text-muted">{quantity}</span>
    <span className="num min-w-[78px] text-right text-[13.5px] font-semibold text-text-high">
      {rupees(value)}
    </span>
  </div>
);

const Empty: React.FC<{ children: string }> = ({ children }) => (
  <p className="border-t border-line px-3 py-2.5 text-[12px] text-text-muted">{children}</p>
);

const unitsLabel = (n: number) => plural(Math.round(n * 100) / 100, 'unit');

/**
 * Sales split into fuel (a line per grade) and everything else, with a total and
 * a stacked bar. Shared by Home, the Shift Summary and the DSSR: the caller says
 * which Shifts the fuel covers and whether the products are live, so the same
 * figures can never be mislabelled on one screen and not another.
 */
export const SalesByProduct: React.FC<Props> = ({
  fuel,
  products,
  fuelNote,
  productsNote,
  productsTitle = 'Lubes & others',
  fuelTotal,
  productsTotal,
}) => {
  const fuelSum = fuelTotal ?? sumOf(fuel);
  const productSum = productsTotal ?? sumOf(products);
  const total = fuelSum + productSum;
  const units = products.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="mx-3 overflow-hidden rounded-[14px] border border-line bg-card">
      <div className="px-3 pb-2.5 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-text-muted">Total sales</span>
          <span className="num text-[17px] font-semibold text-text-high">{rupees(total)}</span>
        </div>
        {total > 0 && (
          <div
            aria-hidden="true"
            className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
          >
            {fuel
              .filter((f) => f.value > 0)
              .map((f, i) => (
                <div key={f.key} className={swatchOf(i)} style={{ flex: f.value }} />
              ))}
            {productSum > 0 && (
              <div
                className="bg-text-muted"
                style={{ flex: Math.max(productSum, total * 0.012) }}
              />
            )}
          </div>
        )}
      </div>

      <GroupHeader title="Fuel" note={fuelNote} />
      {fuel.length === 0 && <Empty>Fuel appears once a Shift closes.</Empty>}
      {fuel.map((f, i) => (
        <Row
          key={f.key}
          swatch={swatchOf(i)}
          name={
            <>
              {f.name}
              {f.code && <span className="font-medium text-text-muted"> · {f.code}</span>}
            </>
          }
          quantity={`${Math.round(f.quantity).toLocaleString('en-IN')} ${f.unit}`}
          value={f.value}
        />
      ))}

      <GroupHeader title={productsTitle} note={productsNote} />
      {products.length === 0 && <Empty>No product sales yet.</Empty>}
      {products.map((p) => (
        <Row
          key={p.key}
          swatch="bg-text-muted opacity-60"
          name={p.name}
          quantity={p.quantity > 0 ? unitsLabel(p.quantity) : undefined}
          value={p.value}
        />
      ))}
      {products.length > 1 && (
        <div className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-2.5 border-t border-line bg-card-alt px-3 py-2.5">
          <span />
          <span className="text-[13px] font-semibold text-text-high">Products total</span>
          <span className="num text-right text-[11.5px] text-text-muted">
            {units > 0 ? unitsLabel(units) : ''}
          </span>
          <span className="num min-w-[78px] text-right text-[13.5px] font-semibold text-text-high">
            {rupees(productSum)}
          </span>
        </div>
      )}
    </div>
  );
};
