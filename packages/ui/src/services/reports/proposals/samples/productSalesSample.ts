import type { ProductSalesData, ProductSalesLine, FuelDetailLine } from '../productSalesDoc.js';
import { FUELS, LUBES, PERIOD, r2 } from './common.js';
import { OCT_SHIFTS } from './month.js';

const LUBE_UNITS: Record<string, number> = {
  'SV4T-1': 118,
  'SVPR-35': 34,
  'SVF-5W30': 15,
  'CLT-1': 41,
  'GRS-500': 26,
  'DW-1': 96,
  WIPER: 9,
};

function lines(): ProductSalesLine[] {
  const fuel = FUELS.map((p) => {
    const reads = OCT_SHIFTS.flatMap((s) => s.readings).filter(
      (x) => x.nozzle.fuel.code === p.code,
    );
    const q = r2(reads.reduce((a, x) => a + x.netL, 0));
    const total = r2(reads.reduce((a, x) => a + x.value, 0));
    const vat = r2((total * p.taxRate) / (100 + p.taxRate));
    return {
      product: p.name,
      category: p.category,
      type: 'Fuel' as const,
      unit: 'L',
      qty: q,
      avgRate: r2(total / q),
      taxable: r2(total - vat),
      cgst: 0,
      sgst: 0,
      igst: 0,
      vat,
      total,
    };
  });
  const products = LUBES.map((p) => {
    const q = LUBE_UNITS[p.code];
    const total = r2(q * p.rate);
    const taxable = r2(total / (1 + p.taxRate / 100));
    const half = r2((total - taxable) / 2);
    return {
      product: p.name,
      category: p.category,
      type: 'Product' as const,
      unit: 'Nos',
      qty: q,
      avgRate: p.rate,
      taxable,
      cgst: half,
      sgst: r2(total - taxable - half),
      igst: 0,
      vat: 0,
      total,
    };
  });
  return [...fuel, ...products];
}

const all = lines();
const productTotal = all.filter((l) => l.type === 'Product').reduce((a, l) => a + l.total, 0);
const shiftProduct = OCT_SHIFTS.reduce((a, s) => a + s.productValue, 0);

const detail: FuelDetailLine[] = OCT_SHIFTS.flatMap((s) =>
  s.readings.map((x) => ({
    date: s.date,
    nozzle: x.nozzle.code,
    du: x.nozzle.du,
    product: x.nozzle.fuel.name,
    shift: s.label,
    attendant: x.attendant,
    opening: x.opening,
    closing: x.closing,
    testing: x.testing,
    netL: x.netL,
    rate: x.rate,
    value: x.value,
  })),
);
const shown = detail.filter((d) => d.date === '2026-10-01');

const days = [...new Set(OCT_SHIFTS.map((s) => s.date))].map((date) => {
  const ss = OCT_SHIFTS.filter((s) => s.date === date);
  const reads = ss.flatMap((s) => s.readings);
  return {
    date,
    fuelL: r2(reads.reduce((a, x) => a + x.netL, 0)),
    fuelValue: r2(reads.reduce((a, x) => a + x.value, 0)),
    // Scaled so the days add up to the product lines above.
    productValue: r2((ss.reduce((a, s) => a + s.productValue, 0) * productTotal) / shiftProduct),
  };
});

// Rounding remainders land on the last day, so the days add up to the lines exactly.
const fuelLines = all.filter((l) => l.type === 'Fuel');
const daily = days.map((d, i) =>
  i < days.length - 1
    ? d
    : {
        ...d,
        fuelL: r2(
          d.fuelL +
            fuelLines.reduce((a, l) => a + l.qty, 0) -
            days.reduce((a, x) => a + x.fuelL, 0),
        ),
        fuelValue: r2(
          d.fuelValue +
            fuelLines.reduce((a, l) => a + l.total, 0) -
            days.reduce((a, x) => a + x.fuelValue, 0),
        ),
        productValue: r2(
          d.productValue + productTotal - days.reduce((a, x) => a + x.productValue, 0),
        ),
      },
);

const grand = all.reduce((a, l) => a + l.total, 0);
const fuelL = all.filter((l) => l.type === 'Fuel').reduce((a, l) => a + l.qty, 0);

export const PRODUCT_SALES_SAMPLE: ProductSalesData = {
  filters: {
    period: PERIOD,
    category: 'All',
    product: 'All',
    shift: 'All',
    nozzle: 'All',
    attendant: 'All',
  },
  lines: all,
  fuelDetail: shown,
  fuelDetailMore: detail.length - shown.length,
  daily,
  previous: {
    label: 'Sep 2026',
    total: r2(grand * 0.957),
    fuelL: r2(fuelL * 0.968),
    productValue: r2(productTotal * 1.06),
  },
};
