import type { ProductPurchaseData, PurchaseLine } from '../productPurchaseDoc.js';
import { FUELS, LUBES, PERIOD, SUPPLIERS, r2, rng, type SampleProduct } from './common.js';
import { FUEL_RECEIPTS } from './tankVariationSample.js';

const [IOCL, SERVO, ACCESSORIES] = SUPPLIERS;

/** The calendar day before an Oct 2026 date (`2026-10-01` → `2026-09-30`). */
const dayBefore = (iso: string) => {
  const d = Number(iso.slice(8));
  return d === 1 ? '2026-09-30' : `2026-10-${String(d - 1).padStart(2, '0')}`;
};

/** A fuel invoice line: basic price ex VAT, VAT on top (the cost price is VAT inclusive). */
function fuelLine(
  p: SampleProduct,
  litres: number,
  date: string,
  billNo: string,
  billDate: string,
): PurchaseLine {
  const rate = r2((p.cost * 100) / (100 + p.taxRate));
  const taxable = r2(litres * rate);
  const vat = r2((taxable * p.taxRate) / 100);
  return {
    date,
    supplier: IOCL.name,
    gstin: IOCL.gstin,
    billNo,
    billDate,
    product: p.name,
    category: p.category,
    type: 'Fuel',
    unit: 'L',
    qty: litres,
    rate,
    taxable,
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat,
    total: r2(taxable + vat),
  };
}

/** A product invoice line: cost price ex GST, intra-state CGST + SGST on top. */
function productLine(
  supplier: (typeof SUPPLIERS)[number],
  code: string,
  units: number,
  date: string,
  billNo: string,
  billDate: string,
): PurchaseLine {
  const p = LUBES.find((l) => l.code === code)!;
  const taxable = r2(units * p.cost);
  const half = r2((taxable * p.taxRate) / 200);
  return {
    date,
    supplier: supplier.name,
    gstin: supplier.gstin,
    billNo,
    billDate,
    product: p.name,
    category: p.category,
    type: 'Product',
    unit: 'Nos',
    qty: units,
    rate: p.cost,
    taxable,
    cgst: half,
    sgst: half,
    igst: 0,
    vat: 0,
    total: r2(taxable + half * 2),
  };
}

function fuelLines(): PurchaseLine[] {
  const r = rng(20261002);
  const dates = [...new Set(FUEL_RECEIPTS.map((x) => x.date))].sort();
  return dates.flatMap((date, i) => {
    // A tanker loads at the depot the evening before or early the same morning.
    const billDate = r.next() < 0.55 ? dayBefore(date) : date;
    const billNo = `KOC/26/${48210 + i * 3 + r.int(0, 2)}`;
    return FUEL_RECEIPTS.filter((x) => x.date === date).map((x) =>
      fuelLine(
        FUELS.find((f) => f.code === x.fuelCode)!,
        x.invoicedL,
        date,
        billNo,
        billDate,
      ),
    );
  });
}

const SERVO_BILLS: { date: string; billDate: string; billNo: string; items: [string, number][] }[] =
  [
    {
      date: '2026-10-06',
      billDate: '2026-10-05',
      billNo: 'SLD/2627/1184',
      items: [
        ['SV4T-1', 48],
        ['SVPR-35', 12],
        ['SVF-5W30', 6],
        ['CLT-1', 24],
        ['GRS-500', 12],
      ],
    },
    {
      date: '2026-10-16',
      billDate: '2026-10-16',
      billNo: 'SLD/2627/1251',
      items: [
        ['SV4T-1', 48],
        ['SVPR-35', 12],
        ['GRS-500', 12],
      ],
    },
    {
      date: '2026-10-27',
      billDate: '2026-10-26',
      billNo: 'SLD/2627/1339',
      items: [
        ['SV4T-1', 24],
        ['SVPR-35', 12],
        ['SVF-5W30', 6],
        ['CLT-1', 12],
      ],
    },
  ];

const ACCESSORY_BILLS: typeof SERVO_BILLS = [
  {
    date: '2026-10-09',
    billDate: '2026-10-09',
    billNo: 'KAA/412',
    items: [
      ['DW-1', 60],
      ['WIPER', 10],
    ],
  },
  { date: '2026-10-23', billDate: '2026-10-22', billNo: 'KAA/447', items: [['DW-1', 48]] },
];

const productLines = (supplier: (typeof SUPPLIERS)[number], bills: typeof SERVO_BILLS) =>
  bills.flatMap((b) =>
    b.items.map(([code, units]) =>
      productLine(supplier, code, units, b.date, b.billNo, b.billDate),
    ),
  );

export const PRODUCT_PURCHASE_SAMPLE: ProductPurchaseData = {
  filters: { period: PERIOD, supplier: 'All', product: 'All', category: 'All' },
  lines: [
    ...fuelLines(),
    ...productLines(SERVO, SERVO_BILLS),
    ...productLines(ACCESSORIES, ACCESSORY_BILLS),
  ],
  productOrder: [...FUELS, ...LUBES].map((p) => p.name),
};
