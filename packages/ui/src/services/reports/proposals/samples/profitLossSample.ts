import type { PLLine, ProfitLossData } from '../profitLossDoc.js';
import { ALL_PRODUCTS, PERIOD, PREV_PERIOD, STATION_NAME, r2, rng } from './common.js';
import { EXPENSE_HEADS, INCOME_HEADS, OCT_EXPENSES, OCT_INCOME } from './financeMonth.js';
import { PRODUCT_SALES_SAMPLE } from './productSalesSample.js';

/*
 * Oct 2026 figures come from the shared month (report 01's sales, report 12's
 * expenses, report 13's income). Sep 2026 is the same station a month earlier:
 * fuel litres 3.2% lower and product sales 6% higher, as report 01 compares.
 */

const FUEL_PREV = 0.968;
const PRODUCT_PREV = 1.06;
const r = rng(20260930);

const lines = PRODUCT_SALES_SAMPLE.lines;
const product = (name: string) => ALL_PRODUCTS.find((p) => p.name === name)!;
const fuels = lines.filter((l) => l.type === 'Fuel');
const products = lines.filter((l) => l.type === 'Product');
const categories = [...new Set(products.map((l) => l.category))];

const fuelRevenue: PLLine[] = fuels.map((l) => ({
  label: l.product,
  detail: `${l.qty.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L`,
  now: l.total,
  prev: r2(l.total * FUEL_PREV),
}));

const fuelCost: PLLine[] = fuels.map((l) => {
  const now = r2(l.qty * product(l.product).cost);
  return { label: l.product, now, prev: r2(now * FUEL_PREV) };
});

const productRevenue: PLLine[] = categories.map((cat) => {
  const ls = products.filter((l) => l.category === cat);
  const now = r2(ls.reduce((a, l) => a + l.taxable, 0));
  return {
    label: cat,
    detail: `${ls.reduce((a, l) => a + l.qty, 0)} nos`,
    now,
    prev: r2(now * PRODUCT_PREV),
  };
});

/** Product cost net of GST: the GST paid is claimed back as ITC. */
const productCost: PLLine[] = categories.map((cat) => {
  const ls = products.filter((l) => l.category === cat);
  const now = r2(
    ls.reduce(
      (a, l) => a + (l.qty * product(l.product).cost) / (1 + product(l.product).taxRate / 100),
      0,
    ),
  );
  return { label: cat, now, prev: r2(now * PRODUCT_PREV) };
});

const otherIncome: PLLine[] = INCOME_HEADS.map((h) => {
  const now = r2(OCT_INCOME.filter((e) => e.head === h.head).reduce((a, e) => a + e.taxable, 0));
  return { label: h.head, now, prev: r2(now * r.between(0.8, 1.15)) };
});

const expenseLines = (type: 'Direct' | 'Indirect'): PLLine[] =>
  EXPENSE_HEADS.filter((h) => h.type === type).map((h) => {
    const now = r2(OCT_EXPENSES.filter((e) => e.head === h.head).reduce((a, e) => a + e.amount, 0));
    const steady = h.head === 'Rent' || h.head === 'Salaries & wages';
    return {
      label: h.head,
      now,
      prev: steady ? r2(now * (h.head === 'Rent' ? 1 : 0.985)) : r2(now * r.between(0.75, 1.2)),
    };
  });

export const PROFIT_LOSS_SAMPLE: ProfitLossData = {
  filters: { period: PERIOD, compare: `On (${PREV_PERIOD})`, station: STATION_NAME },
  periods: { now: 'Oct 2026', prev: PREV_PERIOD },
  revenue: { fuel: fuelRevenue, products: productRevenue },
  costOfSales: { fuel: fuelCost, products: productCost },
  otherIncome,
  directExpenses: expenseLines('Direct'),
  indirectExpenses: expenseLines('Indirect'),
};
