import type { Gstr1Data, Gstr1HsnRow, TaxSplit } from '../gstr1Doc.js';
import { LETTERHEAD, LUBES, PERIOD, STATION_NAME, r2 } from './common.js';
import { INCOME_HEADS, OCT_B2B_INVOICES, OCT_INCOME, OCT_INVOICE_SERIES } from './financeMonth.js';
import { OCT_SHIFTS } from './month.js';
import { PRODUCT_SALES_SAMPLE } from './productSalesSample.js';

const POS = '32-Kerala';
const RATE = 18;

const HSN_NAMES: Record<string, string> = {
  '27101981': 'Lubricating oils (engine oil)',
  '27101990': 'Lubricating greases',
  '38200000': 'Anti-freezing / coolant preparations',
  '28510010': 'Distilled water',
  '85129000': 'Wiper blades (vehicle parts)',
};

const zero = (): TaxSplit => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

/** Product Sales lines (from report 01), keyed to their HSN. */
const productLines = PRODUCT_SALES_SAMPLE.lines
  .filter((l) => l.type === 'Product')
  .map((l) => ({ ...l, hsn: LUBES.find((p) => p.name === l.product)!.hsn }));

const b2b = OCT_B2B_INVOICES.map((inv) => {
  const taxable = r2(inv.lines.reduce((a, l) => a + l.taxable, 0));
  const cgst = r2(inv.lines.reduce((a, l) => a + l.cgst, 0));
  const sgst = r2(inv.lines.reduce((a, l) => a + l.sgst, 0));
  return {
    gstin: inv.gstin,
    name: inv.customer,
    invoiceNo: inv.no,
    date: inv.date,
    placeOfSupply: POS,
    rate: RATE,
    taxable,
    igst: 0,
    cgst,
    sgst,
    cess: 0,
    value: r2(inv.lines.reduce((a, l) => a + l.total, 0)),
    items: inv.lines.map((l) => `${l.product.name} × ${l.qty}`).join(', '),
  };
});

const taxedIncome = OCT_INCOME.filter((e) => e.gstRate > 0).map((e) => {
  const cgst = r2(e.gst / 2);
  return { ...e, cgst, sgst: r2(e.gst - cgst) };
});

const hsnCodes = [...new Set(productLines.map((l) => l.hsn))];

const b2bHsn: Gstr1HsnRow[] = hsnCodes
  .map((hsn) => {
    const ls = OCT_B2B_INVOICES.flatMap((i) => i.lines).filter((l) => l.product.hsn === hsn);
    return {
      tab: 'B2B' as const,
      hsn,
      description: HSN_NAMES[hsn],
      uqc: 'NOS',
      qty: ls.reduce((a, l) => a + l.qty, 0),
      rate: RATE,
      taxable: r2(ls.reduce((a, l) => a + l.taxable, 0)),
      igst: 0,
      cgst: r2(ls.reduce((a, l) => a + l.cgst, 0)),
      sgst: r2(ls.reduce((a, l) => a + l.sgst, 0)),
      cess: 0,
    };
  })
  .filter((h) => h.qty > 0);

const b2cProductHsn: Gstr1HsnRow[] = hsnCodes.map((hsn) => {
  const ls = productLines.filter((l) => l.hsn === hsn);
  const inB2b = b2bHsn.find((h) => h.hsn === hsn) ?? { ...zero(), qty: 0 };
  return {
    tab: 'B2C' as const,
    hsn,
    description: HSN_NAMES[hsn],
    uqc: 'NOS',
    qty: ls.reduce((a, l) => a + l.qty, 0) - inB2b.qty,
    rate: RATE,
    taxable: r2(ls.reduce((a, l) => a + l.taxable, 0) - inB2b.taxable),
    igst: 0,
    cgst: r2(ls.reduce((a, l) => a + l.cgst, 0) - inB2b.cgst),
    sgst: r2(ls.reduce((a, l) => a + l.sgst, 0) - inB2b.sgst),
    cess: 0,
  };
});

const b2cIncomeHsn: Gstr1HsnRow[] = INCOME_HEADS.filter((h) => h.gstRate > 0).map((h) => {
  const es = taxedIncome.filter((e) => e.head === h.head);
  return {
    tab: 'B2C' as const,
    hsn: h.hsn!,
    description: h.hsnDescription!,
    uqc: 'NA',
    qty: 0,
    rate: h.gstRate,
    taxable: r2(es.reduce((a, e) => a + e.taxable, 0)),
    igst: 0,
    cgst: r2(es.reduce((a, e) => a + e.cgst, 0)),
    sgst: r2(es.reduce((a, e) => a + e.sgst, 0)),
    cess: 0,
  };
});

const sumSplit = (xs: TaxSplit[]): TaxSplit => ({
  taxable: r2(xs.reduce((a, x) => a + x.taxable, 0)),
  igst: r2(xs.reduce((a, x) => a + x.igst, 0)),
  cgst: r2(xs.reduce((a, x) => a + x.cgst, 0)),
  sgst: r2(xs.reduce((a, x) => a + x.sgst, 0)),
  cess: r2(xs.reduce((a, x) => a + x.cess, 0)),
});

const b2csHsn = [...b2cProductHsn, ...b2cIncomeHsn];
const b2cs = sumSplit(b2csHsn);
const products = sumSplit(productLines.map((l) => ({ ...l, cess: 0 })));
const invoiced = sumSplit(b2b);
const income = sumSplit(taxedIncome.map((e) => ({ ...e, igst: 0, cess: 0 })));
const taxOf = (t: TaxSplit) => r2(t.igst + t.cgst + t.sgst + t.cess);

export const GSTR1_SAMPLE: Gstr1Data = {
  filters: { period: PERIOD, gstin: LETTERHEAD.gstin!, station: STATION_NAME },
  b2b,
  b2cs: [{ placeOfSupply: POS, rate: RATE, ...b2cs }],
  b2csBuildUp: [
    {
      label: 'Product Sales, all (GST 18%)',
      taxable: products.taxable,
      tax: taxOf(products),
      sign: 1,
    },
    {
      label: 'less: invoiced to GSTIN customers (4A)',
      taxable: invoiced.taxable,
      tax: taxOf(invoiced),
      sign: -1,
    },
    {
      label: 'add: Income with GST (scrap, rent)',
      taxable: income.taxable,
      tax: taxOf(income),
      sign: 1,
    },
  ],
  hsn: [...b2bHsn, ...b2csHsn],
  docs: [{ nature: 'Invoices for outward supply', ...OCT_INVOICE_SERIES }],
  fuelExcluded: r2(OCT_SHIFTS.flatMap((s) => s.readings).reduce((a, x) => a + x.value, 0)),
};
