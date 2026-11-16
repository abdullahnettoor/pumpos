import type { StockLine, StockStatementData } from '../stockStatementDoc.js';
import { FUELS, LUBES, PERIOD, TANKS, r2 } from './common.js';
import { PRODUCT_PURCHASE_SAMPLE } from './productPurchaseSample.js';
import { PRODUCT_SALES_SAMPLE } from './productSalesSample.js';
import { TANK_DAYS } from './tankVariationSample.js';

/** Shelf stock on 01 Oct (Nos). */
const LUBE_OPENING: Record<string, number> = {
  'SV4T-1': 40,
  'SVPR-35': 14,
  'SVF-5W30': 7,
  'CLT-1': 15,
  'GRS-500': 14,
  'DW-1': 40,
  WIPER: 6,
};
/** Physical Count Variance booked in the month (damaged / counted short). */
const LUBE_ADJUST: Record<string, number> = { 'CLT-1': -1, 'DW-1': -2 };

const soldUnits = (name: string) =>
  PRODUCT_SALES_SAMPLE.lines.find((l) => l.product === name)?.qty ?? 0;
const boughtUnits = (name: string) =>
  PRODUCT_PURCHASE_SAMPLE.lines.filter((l) => l.product === name).reduce((a, l) => a + l.qty, 0);

const fuel: StockLine[] = FUELS.map((p) => {
  const tanks = TANKS.filter((t) => t.fuel.code === p.code).map((t) => t.code);
  const days = TANK_DAYS.filter((d) => tanks.includes(d.tank));
  const opening = r2(
    tanks.reduce(
      (a, t) => a + (days.find((d) => d.tank === t && d.date === '2026-10-01')?.openingBook ?? 0),
      0,
    ),
  );
  const inQty = r2(days.reduce((a, d) => a + d.receipts, 0));
  const outQty = r2(days.reduce((a, d) => a + d.sales, 0));
  const adjust = r2(days.reduce((a, d) => a + (d.dipClosing - d.bookClosing), 0));
  return {
    product: p.name,
    category: p.category,
    type: 'Fuel',
    unit: 'L',
    opening,
    inQty,
    outQty,
    adjust,
    closing: r2(opening + inQty - outQty + adjust),
    rate: p.cost,
  };
});

const products: StockLine[] = LUBES.map((p) => {
  const opening = LUBE_OPENING[p.code];
  const inQty = boughtUnits(p.name);
  const outQty = soldUnits(p.name);
  const adjust = LUBE_ADJUST[p.code] ?? 0;
  return {
    product: p.name,
    category: p.category,
    type: 'Product',
    unit: 'Nos',
    opening,
    inQty,
    outQty,
    adjust,
    closing: opening + inQty - outQty + adjust,
    rate: p.cost,
    reorderLevel: p.reorderLevel,
  };
});

export const STOCK_STATEMENT_SAMPLE: StockStatementData = {
  filters: {
    period: PERIOD,
    asOf: '31 Oct 2026 (closing)',
    category: 'All',
    product: 'All',
    lowStockOnly: 'No',
  },
  lines: [...fuel, ...products],
};
