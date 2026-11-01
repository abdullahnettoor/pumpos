import { CUSTOMERS, LUBES, OCT_DAYS, SUPPLIERS, r2, rng, type SampleProduct } from './common.js';

/*
 * One generated month of office money and GST paperwork (Oct 2026): the
 * Expenses and Income Office Records, the product Purchases and the GST
 * invoices issued on Billed Sales. The expense, income, GSTR-1, GSTR-3B and
 * P&L proposals all read it, so their figures agree with each other.
 */

export type HeadType = 'Direct' | 'Indirect';

export const FUNDING = {
  cash: 'Cash in Hand',
  petty: 'Petty Cash',
  bank: 'HDFC Bank',
  omc: 'OMC Wallet (CMS)',
} as const;

export interface ExpenseHead {
  head: string;
  /** Group-B flag on the expense head. */
  type: HeadType;
}

export const EXPENSE_HEADS: ExpenseHead[] = [
  { head: 'Salaries & wages', type: 'Direct' },
  { head: 'Electricity', type: 'Direct' },
  { head: 'Generator diesel', type: 'Direct' },
  { head: 'Repairs & maintenance - DU', type: 'Direct' },
  { head: 'Tea & refreshments', type: 'Indirect' },
  { head: 'Stationery', type: 'Indirect' },
  { head: 'Bank charges', type: 'Indirect' },
  { head: 'Telephone & internet', type: 'Indirect' },
  { head: 'Rent', type: 'Indirect' },
];

export interface ExpenseEntry {
  /** Entry Date (station calendar date, no shift). */
  date: string;
  head: string;
  type: HeadType;
  /** Read from the description today (no payee field yet). */
  payee: string;
  account: string;
  amount: number;
}

const typeOf = (head: string): HeadType =>
  EXPENSE_HEADS.find((h) => h.head === head)?.type ?? 'Indirect';

function expenses(): ExpenseEntry[] {
  const r = rng(20261012);
  const out: ExpenseEntry[] = [];
  const add = (date: string, head: string, payee: string, account: string, amount: number) =>
    out.push({ date, head, type: typeOf(head), payee, account, amount: r2(amount) });

  // Salaries for October, paid on the last day.
  const staff: [string, number, string][] = [
    ['Manager — Biju Varghese (Oct salary)', 32000, FUNDING.bank],
    ['Accountant — Deepa S (Oct salary)', 24000, FUNDING.bank],
    ['Rahul K (Oct wages)', 16500, FUNDING.bank],
    ['Anil Kumar (Oct wages)', 16500, FUNDING.bank],
    ['Suresh P (Oct wages)', 15800, FUNDING.cash],
    ['Faisal M (Oct wages)', 15800, FUNDING.bank],
    ['Vinod T (Oct wages)', 15200, FUNDING.cash],
    ['Night watchman — Thomas (Oct wages)', 12000, FUNDING.cash],
  ];
  for (const [payee, amount, account] of staff)
    add('2026-10-31', 'Salaries & wages', payee, account, amount);

  add(
    '2026-10-09',
    'Electricity',
    'KSEB — bill Sep 2026 (consumer 1155690021)',
    FUNDING.bank,
    41286,
  );
  add('2026-10-24', 'Electricity', 'KSEB — demand charge revision', FUNDING.bank, 2310);

  for (const date of ['2026-10-04', '2026-10-13', '2026-10-21', '2026-10-29']) {
    const litres = r.int(32, 44);
    add(date, 'Generator diesel', `DG set top-up — ${litres} L HSD`, FUNDING.cash, litres * 96.48);
  }

  add(
    '2026-10-07',
    'Repairs & maintenance - DU',
    'Gilbarco service — DU-2 pulser replacement',
    FUNDING.bank,
    8850,
  );
  add(
    '2026-10-18',
    'Repairs & maintenance - DU',
    'Nozzle N5 hose & swivel — Tokheim spares',
    FUNDING.cash,
    3420,
  );
  add(
    '2026-10-27',
    'Repairs & maintenance - DU',
    'Legal Metrology stamping — DU-1, DU-3',
    FUNDING.cash,
    1600,
  );

  for (const day of [2, 6, 10, 14, 18, 22, 27]) {
    add(
      OCT_DAYS[day - 1],
      'Tea & refreshments',
      'Ramu Tea Stall — staff tea',
      FUNDING.petty,
      r.int(52, 78) * 10,
    );
  }

  add('2026-10-03', 'Stationery', 'Bill books & register — Edappally Stores', FUNDING.petty, 1240);
  add('2026-10-16', 'Stationery', 'Printer roll & toner — Krishna Computers', FUNDING.petty, 2180);
  add('2026-10-26', 'Stationery', 'Photocopy & files', FUNDING.petty, 385);

  add('2026-10-05', 'Bank charges', 'HDFC — POS terminal rental (2 nos)', FUNDING.bank, 1416);
  add('2026-10-15', 'Bank charges', 'HDFC — cash deposit handling charges', FUNDING.bank, 1890);
  add('2026-10-31', 'Bank charges', 'HDFC — SMS & NEFT charges', FUNDING.bank, 247.8);

  add('2026-10-08', 'Telephone & internet', 'BSNL FTTH — Oct', FUNDING.bank, 1179);
  add('2026-10-11', 'Telephone & internet', 'Jio postpaid — manager & office', FUNDING.bank, 1062);

  add('2026-10-05', 'Rent', 'Land lease — K. Madhavan (Oct)', FUNDING.bank, 25000);

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const OCT_EXPENSES: ExpenseEntry[] = expenses();

export interface IncomeHead {
  head: string;
  type: HeadType;
  /** GST % frozen at capture; 0 = recorded without GST. */
  gstRate: number;
  /** HSN / SAC used on the GSTR-1 HSN summary when the head carries GST. */
  hsn?: string;
  hsnDescription?: string;
}

export const INCOME_HEADS: IncomeHead[] = [
  { head: 'OMC incentive / commission', type: 'Direct', gstRate: 0 },
  { head: 'Air / nitrogen filling', type: 'Indirect', gstRate: 0 },
  {
    head: 'Scrap & empty barrel sale',
    type: 'Indirect',
    gstRate: 18,
    hsn: '7204',
    hsnDescription: 'Ferrous waste & scrap, empty barrels',
  },
  {
    head: 'Rent from ATM / kiosk space',
    type: 'Indirect',
    gstRate: 18,
    hsn: '997212',
    hsnDescription: 'Rental of non-residential property',
  },
  { head: 'Interest on deposit', type: 'Indirect', gstRate: 0 },
];

export interface IncomeEntry {
  date: string;
  head: string;
  type: HeadType;
  /** Read from the description today (no payer field yet). */
  payer: string;
  account: string;
  taxable: number;
  gstRate: number;
  gst: number;
  amount: number;
}

function income(): IncomeEntry[] {
  const r = rng(20261013);
  const out: IncomeEntry[] = [];
  const add = (date: string, head: string, payer: string, account: string, taxable: number) => {
    const h = INCOME_HEADS.find((x) => x.head === head)!;
    const gst = r2((taxable * h.gstRate) / 100);
    out.push({
      date,
      head,
      type: h.type,
      payer,
      account,
      taxable: r2(taxable),
      gstRate: h.gstRate,
      gst,
      amount: r2(taxable + gst),
    });
  };

  add('2026-10-06', 'OMC incentive / commission', 'IOCL — Q2 volume incentive', FUNDING.omc, 18640);
  add(
    '2026-10-20',
    'OMC incentive / commission',
    'IOCL — XP95 promotion commission',
    FUNDING.omc,
    4215.5,
  );

  for (const day of [7, 14, 21, 28, 31]) {
    add(
      OCT_DAYS[day - 1],
      'Air / nitrogen filling',
      'Nitrogen machine — weekly collection',
      FUNDING.cash,
      r.int(118, 164) * 10,
    );
  }

  add(
    '2026-10-12',
    'Scrap & empty barrel sale',
    'Kochi Scrap Traders — 14 empty barrels',
    FUNDING.cash,
    4200,
  );
  add(
    '2026-10-23',
    'Scrap & empty barrel sale',
    'Kochi Scrap Traders — old pump parts',
    FUNDING.cash,
    1850,
  );

  add(
    '2026-10-03',
    'Rent from ATM / kiosk space',
    'Hitachi Payment Services — ATM site rent',
    FUNDING.bank,
    15000,
  );
  add(
    '2026-10-05',
    'Rent from ATM / kiosk space',
    'Fresh Mart kiosk — Oct rent',
    FUNDING.bank,
    6000,
  );

  add(
    '2026-10-31',
    'Interest on deposit',
    'HDFC — FD interest (security deposit)',
    FUNDING.bank,
    3287,
  );

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const OCT_INCOME: IncomeEntry[] = income();

/** A taxed line on a GST document: GST is inside the rate (products) or added (purchases). */
export interface GstLine {
  product: SampleProduct;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
}

const lube = (code: string) => LUBES.find((p) => p.code === code)!;

/** A GST-inclusive line: `total` is qty × price, the tax split out of it. */
export function inclusiveLine(product: SampleProduct, qty: number, unitPrice: number): GstLine {
  const total = r2(qty * unitPrice);
  const taxable = r2(total / (1 + product.taxRate / 100));
  const cgst = r2((total - taxable) / 2);
  return { product, qty, taxable, cgst, sgst: r2(total - taxable - cgst), total };
}

export interface B2bInvoice {
  no: string;
  date: string;
  customer: string;
  gstin: string;
  lines: GstLine[];
}

const customer = (name: string) => CUSTOMERS.find((c) => c.name === name)!;

/** GST invoices issued on Billed Sales to registered (GSTIN) customers. */
export const OCT_B2B_INVOICES: B2bInvoice[] = (
  [
    [
      'SLF/26-27/0431',
      '2026-10-04',
      'Kochi Metro Logistics',
      [
        ['SVPR-35', 6],
        ['CLT-1', 6],
      ],
    ],
    [
      'SLF/26-27/0468',
      '2026-10-09',
      'Malabar Constructions',
      [
        ['GRS-500', 8],
        ['SVPR-35', 4],
      ],
    ],
    [
      'SLF/26-27/0502',
      '2026-10-15',
      'Periyar Travels',
      [
        ['SVF-5W30', 3],
        ['WIPER', 4],
      ],
    ],
    [
      'SLF/26-27/0539',
      '2026-10-22',
      'Kochi Metro Logistics',
      [
        ['SVPR-35', 5],
        ['DW-1', 12],
      ],
    ],
    ['SLF/26-27/0571', '2026-10-28', 'Malabar Constructions', [['SV4T-1', 10]]],
  ] as [string, string, string, [string, number][]][]
).map(([no, date, name, lines]) => ({
  no,
  date,
  customer: name,
  gstin: customer(name).gstin,
  lines: lines.map(([code, q]) => inclusiveLine(lube(code), q, lube(code).rate)),
}));

/** The GST invoice series of Billed Sales in the month (document summary). */
export const OCT_INVOICE_SERIES = {
  from: 'SLF/26-27/0412',
  to: 'SLF/26-27/0587',
  total: 176,
  cancelled: 2,
};

export interface ProductPurchase {
  date: string;
  supplier: string;
  gstin: string;
  invoiceNo: string;
  /** Cost price is GST inclusive, so the line splits the same way as a sale. */
  lines: GstLine[];
}

const supplier = (name: string) => SUPPLIERS.find((s) => s.name === name)!;

/** Product (lube & accessory) Purchases: Business-Day anchored stock events carrying GST. */
export const OCT_PRODUCT_PURCHASES: ProductPurchase[] = (
  [
    [
      '2026-10-02',
      'Servo Lubes Distributors',
      'SLD/2627/1184',
      [
        ['SV4T-1', 48],
        ['SVPR-35', 12],
        ['CLT-1', 24],
      ],
    ],
    [
      '2026-10-13',
      'Servo Lubes Distributors',
      'SLD/2627/1302',
      [
        ['SV4T-1', 36],
        ['SVF-5W30', 6],
        ['GRS-500', 24],
      ],
    ],
    [
      '2026-10-19',
      'Kerala Auto Accessories',
      'KAA/1029',
      [
        ['DW-1', 96],
        ['WIPER', 10],
      ],
    ],
    [
      '2026-10-25',
      'Servo Lubes Distributors',
      'SLD/2627/1411',
      [
        ['SV4T-1', 24],
        ['SVPR-35', 18],
        ['SVF-5W30', 6],
      ],
    ],
  ] as [string, string, string, [string, number][]][]
).map(([date, name, invoiceNo, lines]) => ({
  date,
  supplier: name,
  gstin: supplier(name).gstin,
  invoiceNo,
  lines: lines.map(([code, q]) => inclusiveLine(lube(code), q, lube(code).cost)),
}));
