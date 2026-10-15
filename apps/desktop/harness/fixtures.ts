/**
 * THROWAWAY harness fixtures: a realistic Kerala fuel station ("Highway Fuels,
 * Kochi") for October 2026. Every generator is deterministic (seeded by date),
 * dated relative to the station's current business date, and filtered by the
 * request's from/to like the API would.
 */
import { resolveBusinessDate, shiftBusinessDate } from '@pump/shared';

export const STATION = {
  id: 'st-1',
  name: 'Highway Fuels, Kochi',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

export const TODAY = resolveBusinessDate({ timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' });
const add = (d: string, n: number) => shiftBusinessDate(d, n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const MONTH_START = `${TODAY.slice(0, 8)}01`;
/** History starts on the 1st of the previous month, so "last month" has data too. */
const HISTORY_START = (() => {
  const prev = add(MONTH_START, -1);
  return `${prev.slice(0, 8)}01`;
})();
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = add(d, 1)) out.push(d);
  return out;
};
const inRange = (d: string, from?: string | null, to?: string | null) =>
  (!from || d >= from) && (!to || d <= to);
/** IST wall time on a date as a UTC ISO instant. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

/** Deterministic 0..1 noise per key. */
function rnd(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
const jitter = (key: string, base: number, spread: number) =>
  base * (1 - spread + 2 * spread * rnd(key));

// ---------------------------------------------------------------- products

export const FUELS = [
  { id: 'p-ms', name: 'Petrol', code: 'MS', price: 107.48, cost: 103.42, perDay: 1800 },
  { id: 'p-hsd', name: 'Diesel', code: 'HSD', price: 95.66, cost: 93.05, perDay: 2800 },
  { id: 'p-xp', name: 'XP95 Premium', code: 'XP95', price: 114.2, cost: 109.1, perDay: 160 },
];
export const MERCH = [
  { id: 'p-gp4t', name: 'Gulf Pride 4T Plus 1L', code: 'GP4T', price: 420, cost: 352, perDay: 6 },
  { id: 'p-gtx', name: 'Castrol GTX 20W-50 1L', code: 'GTX', price: 465, cost: 389, perDay: 4 },
  { id: 'p-cool', name: 'Coolant 1L', code: 'COOL', price: 280, cost: 214, perDay: 3 },
  { id: 'p-dw', name: 'Distilled water 1L', code: 'DW', price: 40, cost: 22, perDay: 9 },
];

export const PRODUCTS = [
  ...FUELS.map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    productType: 'Fuel',
    unit: 'L',
    isActive: true,
    hsnCode: '2710',
    taxConfig: { category: 'FUEL_VAT' },
  })),
  ...MERCH.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    productType: 'Lubricant',
    unit: 'Nos',
    isActive: true,
    hsnCode: '2710',
    taxConfig: { category: 'GST', gstRate: 18 },
  })),
];

/** Per-day fuel volumes and merch units (closed or live). */
function dayFigures(date: string) {
  const live = date === TODAY;
  const share = live ? 0.42 : 1; // the live day is part-way through
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const fuel = FUELS.map((f) => {
    const vol = r2(jitter(`${date}${f.id}`, f.perDay * (weekend ? 0.88 : 1), 0.12) * share);
    return {
      ...f,
      netVolume: vol,
      grossVolume: r2(vol + 15),
      salesValue: r2(vol * f.price),
      cogs: r2(vol * f.cost),
    };
  });
  const merch = MERCH.map((m) => {
    const qty = Math.max(0, Math.round(jitter(`${date}${m.id}`, m.perDay, 0.6) * share));
    return { ...m, qty, revenue: qty * m.price, cogs: qty * m.cost };
  });
  return { fuel, merch };
}

// ---------------------------------------------------------------- access / shift

export const ACCESS = {
  plan: 'CORE',
  capabilities: {
    'reports.attendant': { enabled: true, title: 'Attendant handover report' },
  },
  limits: { station_count: { value: 3, used: 1, reached: false } },
  subscription: {
    status: 'ACTIVE',
    mode: 'NORMAL',
    accessUntil: '2027-03-31T18:29:59.000Z',
    showWarning: false,
    warningMessage: null,
    resolution: null,
  },
};

export const shiftStatus = () => ({
  activeShift: {
    id: 'sh-live',
    stationId: STATION.id,
    businessDate: TODAY,
    shiftSequence: 2,
    shiftTemplateName: 'Evening',
    openedAt: at(TODAY, '14:00'),
    status: 'OPEN',
  },
  businessDate: TODAY,
});

// ---------------------------------------------------------------- DSR

function dsrSnapshot(date: string, shifts: number) {
  const { fuel, merch } = dayFigures(date);
  const fuelValue = fuel.reduce((a, f) => a + f.salesValue, 0);
  const merchRevenue = merch.reduce((a, m) => a + m.revenue, 0);
  const cogs = fuel.reduce((a, f) => a + f.cogs, 0) + merch.reduce((a, m) => a + m.cogs, 0);
  const revenue = fuelValue + merchRevenue;
  const card = r2(fuelValue * 0.11);
  const upi = r2(fuelValue * 0.27);
  const credit = r2(fuelValue * 0.07);
  return {
    businessDate: date,
    shiftsIncluded: shifts,
    fuel: {
      totalVolume: r2(fuel.reduce((a, f) => a + f.grossVolume, 0)),
      totalNetVolume: r2(fuel.reduce((a, f) => a + f.netVolume, 0)),
      totalSalesValue: r2(fuelValue),
      byProduct: fuel.map((f) => ({
        productId: f.id,
        productName: f.name,
        productCode: f.code,
        unit: 'L',
        grossVolume: f.grossVolume,
        testingVolume: 15,
        netVolume: f.netVolume,
        unitPrice: f.price,
        salesValue: f.salesValue,
      })),
    },
    merchandise: { total: merchRevenue },
    payments: { card, upi, credit },
    cashSales: r2(revenue - card - upi - credit),
    pnl: {
      revenue: r2(revenue),
      cogs: r2(cogs),
      grossMargin: r2(revenue - cogs),
    },
  };
}

/** Generated DSRs: the last ten closed days (older days were never generated). */
export function dssrRange(from: string, to: string) {
  return days(add(TODAY, -10), add(TODAY, -1))
    .filter((d) => inRange(d, from, to))
    .map((d) => ({
      id: `dssr-${d}`,
      stationId: STATION.id,
      businessDate: d,
      generatedAt: at(add(d, 1), '06:20'),
      snapshotData: dsrSnapshot(d, 3),
    }));
}

export function dssrPreview(date: string) {
  return {
    id: null,
    stationId: STATION.id,
    businessDate: date,
    generatedAt: new Date().toISOString(),
    live: date === TODAY,
    snapshotData: dsrSnapshot(date, date === TODAY ? 1 : 3),
  };
}

// ---------------------------------------------------------------- P&L

const EXPENSE_CATS = [
  { id: 'ec-elec', name: 'Electricity (KSEB)' },
  { id: 'ec-sal', name: 'Staff salary advance' },
  { id: 'ec-gen', name: 'Generator diesel' },
  { id: 'ec-tea', name: 'Tea & snacks' },
  { id: 'ec-maint', name: 'Pump maintenance' },
  { id: 'ec-house', name: 'Housekeeping' },
  { id: 'ec-stat', name: 'Stationery & printing' },
  { id: 'ec-sec', name: 'Security' },
  { id: 'ec-salary', name: 'Staff salaries' },
];
export const EXPENSE_CATEGORIES = EXPENSE_CATS.map((c) => ({ ...c, isActive: true }));

/** Office expenses by entry date. Account: cash, petty, HDFC or owner. */
export function allExpenses() {
  const out: any[] = [];
  for (const d of days(HISTORY_START, TODAY)) {
    const dom = Number(d.slice(8));
    const push = (cat: (typeof EXPENSE_CATS)[number], amount: number, account: string, desc: string) =>
      out.push({
        id: `exp-${d}-${cat.id}`,
        stationId: STATION.id,
        entryDate: d,
        categoryId: cat.id,
        categoryName: cat.name,
        amount: r2(amount),
        description: desc,
        accountId: account,
        status: 'ACTIVE',
        createdAt: at(d, '11:15'),
      });
    push(EXPENSE_CATS[3], jitter(`${d}tea`, 420, 0.3), 'acc-petty', 'Tea for staff');
    if (dom % 2 === 0) push(EXPENSE_CATS[5], jitter(`${d}hk`, 650, 0.2), 'acc-petty', 'Washroom cleaning');
    if (dom % 5 === 1) push(EXPENSE_CATS[2], jitter(`${d}gen`, 2850, 0.15), 'acc-cash', 'Generator HSD top-up');
    if (dom === 5) push(EXPENSE_CATS[0], 38640, 'acc-hdfc', 'KSEB bill, consumer 1155-8823');
    if (dom === 10) push(EXPENSE_CATS[1], 15000, 'acc-cash', 'Advance — Rajesh Kumar');
    if (dom === 3) push(EXPENSE_CATS[4], 18500, 'acc-owner', 'Nozzle hose replacement, DU-2');
    if (dom === 12) push(EXPENSE_CATS[6], 1840, 'acc-petty', 'DSR register, bill books');
    if (dom === 1) push(EXPENSE_CATS[7], 22000, 'acc-hdfc', 'Night security — Aegis Services');
    if (dom === 1) push(EXPENSE_CATS[8], 108000, 'acc-sbi', 'Monthly salaries, 8 staff');
  }
  // One voided entry, so the register is honest about VOIDED being excluded.
  out.push({
    id: 'exp-void',
    stationId: STATION.id,
    entryDate: add(TODAY, -2),
    categoryId: 'ec-tea',
    categoryName: 'Tea & snacks',
    amount: 9999,
    description: 'Entered twice',
    accountId: 'acc-petty',
    status: 'VOIDED',
    createdAt: at(add(TODAY, -2), '12:00'),
  });
  return out.filter((e) => e.entryDate <= TODAY);
}

const INCOME_CATS = [
  { id: 'ic-hoard', name: 'Hoarding rent', hsnCode: '9972', gstRate: 18 },
  { id: 'ic-atm', name: 'ATM space rent', hsnCode: '9972', gstRate: 18 },
  { id: 'ic-scrap', name: 'Scrap sale', hsnCode: '7204', gstRate: 18 },
];
export const INCOME_CATEGORIES = INCOME_CATS.map((c) => ({
  id: c.id,
  name: c.name,
  isActive: true,
  taxConfig: { hsnCode: c.hsnCode, gstRate: c.gstRate },
}));

export function allIncome() {
  const out: any[] = [];
  for (const d of days(HISTORY_START, TODAY)) {
    const dom = Number(d.slice(8));
    const mk = (c: (typeof INCOME_CATS)[number], taxable: number, payer: string, desc: string, inter = false) => {
      const gst = r2((taxable * c.gstRate) / 100);
      out.push({
        id: `inc-${d}-${c.id}`,
        stationId: STATION.id,
        entryDate: d,
        categoryId: c.id,
        categoryName: c.name,
        hsnCode: c.hsnCode,
        payer,
        description: desc,
        gstRate: c.gstRate,
        interState: inter,
        taxableAmount: taxable,
        cgst: inter ? 0 : r2(gst / 2),
        sgst: inter ? 0 : r2(gst / 2),
        igst: inter ? gst : 0,
        cess: 0,
        amount: r2(taxable + gst),
        accountId: 'acc-hdfc',
        status: 'ACTIVE',
        createdAt: at(d, '12:30'),
      });
    };
    if (dom === 2) mk(INCOME_CATS[0], 12000, 'Malayala Manorama Ads', 'NH-66 hoarding, monthly');
    if (dom === 4) mk(INCOME_CATS[1], 18500, 'Hitachi Payment Services', 'ATM kiosk rent', true);
    if (dom === 9) mk(INCOME_CATS[2], 3400, 'Kochi Metal Traders', 'Old barrels and drums');
    if (dom === 12) mk(INCOME_CATS[0], 15000, 'Kalyan Jewellers', 'Canopy fascia board, monthly');
    if (dom === 14) mk(INCOME_CATS[2], 1850, 'Kochi Metal Traders', 'Scrap hoses and fittings');
  }
  return out;
}

export function profitLoss(from: string, to: string) {
  const expenses = allExpenses().filter((e) => e.status !== 'VOIDED');
  const income = allIncome();
  const list = days(from, to < TODAY ? to : TODAY)
    .filter((d) => d >= HISTORY_START)
    .reverse();
  const productAgg = new Map<string, any>();
  const out = list.map((d) => {
    const { fuel, merch } = dayFigures(d);
    const revenueFuel = r2(fuel.reduce((a, f) => a + f.salesValue, 0));
    const revenueMerch = r2(merch.reduce((a, m) => a + m.revenue, 0));
    const cogsFuel = r2(fuel.reduce((a, f) => a + f.cogs, 0));
    const cogsMerch = r2(merch.reduce((a, m) => a + m.cogs, 0));
    const exp = r2(expenses.filter((e) => e.entryDate === d).reduce((a, e) => a + e.amount, 0));
    const inc = r2(income.filter((e) => e.entryDate === d).reduce((a, e) => a + e.taxableAmount, 0));
    for (const f of fuel) {
      const p = productAgg.get(f.id) ?? { productId: f.id, name: f.name, code: f.code, kind: 'fuel', quantity: 0, revenue: 0, cogs: 0 };
      p.quantity += f.netVolume;
      p.revenue += f.salesValue;
      p.cogs += f.cogs;
      productAgg.set(f.id, p);
    }
    for (const m of merch) {
      const p = productAgg.get(m.id) ?? { productId: m.id, name: m.name, code: m.code, kind: 'merchandise', quantity: 0, revenue: 0, cogs: 0 };
      p.quantity += m.qty;
      p.revenue += m.revenue;
      p.cogs += m.cogs;
      productAgg.set(m.id, p);
    }
    const revenue = r2(revenueFuel + revenueMerch);
    const cogs = r2(cogsFuel + cogsMerch);
    const grossMargin = r2(revenue - cogs);
    return {
      date: d,
      live: d === TODAY,
      hasSales: true,
      revenueFuel,
      revenueMerch,
      revenue,
      cogsFuel,
      cogsMerch,
      cogs,
      grossMargin,
      expenses: exp,
      otherIncome: inc,
      netProfit: r2(grossMargin - exp + inc),
    };
  });
  const sum = (k: string) => r2(out.reduce((a, d: any) => a + d[k], 0));
  const totals = {
    revenueFuel: sum('revenueFuel'),
    revenueMerch: sum('revenueMerch'),
    revenue: sum('revenue'),
    cogsFuel: sum('cogsFuel'),
    cogsMerch: sum('cogsMerch'),
    cogs: sum('cogs'),
    grossMargin: sum('grossMargin'),
    expenses: sum('expenses'),
    otherIncome: sum('otherIncome'),
    netProfit: sum('netProfit'),
    marginPct: 0,
  };
  totals.marginPct = totals.revenue ? r2((totals.grossMargin / totals.revenue) * 100) : 0;
  const byProduct = [...productAgg.values()]
    .map((p) => {
      const margin = r2(p.revenue - p.cogs);
      return {
        ...p,
        quantity: r2(p.quantity),
        revenue: r2(p.revenue),
        cogs: r2(p.cogs),
        margin,
        marginPct: p.revenue ? r2((margin / p.revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  return { from, to, days: out, totals, byProduct };
}

// ---------------------------------------------------------------- customers / suppliers

export const CUSTOMERS = [
  { id: 'c-kml', name: 'Kochi Metro Logistics', customerType: 'Fleet', creditLimit: 300000, phone: '9847012345', fleetCode: 'KML' },
  { id: 'c-mal', name: 'Malabar Roadways', customerType: 'Fleet', creditLimit: 250000, phone: '9895023456', fleetCode: 'MRW' },
  { id: 'c-sjs', name: "St. Joseph's School (Buses)", customerType: 'Credit', creditLimit: 120000, phone: '4842345678', fleetCode: null },
  { id: 'c-pcon', name: 'Periyar Constructions', customerType: 'Credit', creditLimit: 150000, phone: '9446034567', fleetCode: null },
  { id: 'c-aluva', name: 'Aluva Tourist Taxi Society', customerType: 'Credit', creditLimit: 60000, phone: '9961045678', fleetCode: null },
];
const VEHICLES: Record<string, string[]> = {
  'c-kml': ['KL-07-CK-4521', 'KL-07-CK-4522', 'KL-07-DA-1180'],
  'c-mal': ['KL-11-AZ-9087', 'KL-11-BB-3302'],
  'c-sjs': ['KL-07-BU-2210', 'KL-07-BU-2211'],
  'c-pcon': ['KL-41-H-7788'],
  'c-aluva': ['KL-41-T-1023', 'KL-41-T-1088'],
};

/** Credit sales + collections + an opening balance, per customer, all-time. */
export function customerLedger(customerId: string) {
  const c = CUSTOMERS.find((x) => x.id === customerId);
  if (!c) return [];
  const rows: any[] = [];
  rows.push({
    id: `${customerId}-open`,
    transactionType: 'Opening Balance',
    amount: Math.round(jitter(`${customerId}open`, c.creditLimit * 0.35, 0.3)),
    notes: 'Carried from the old register',
    createdAt: at(HISTORY_START, '09:00'),
    businessDate: HISTORY_START,
  });
  for (const d of days(HISTORY_START, TODAY)) {
    if (rnd(`${customerId}${d}cs`) < 0.55) {
      const fuel = customerId === 'c-aluva' ? FUELS[0] : FUELS[1];
      const perVisit: Record<string, number> = { 'c-kml': 180, 'c-mal': 120, 'c-sjs': 60, 'c-pcon': 90, 'c-aluva': 30 };
      const qty = r2(jitter(`${customerId}${d}q`, perVisit[customerId] ?? 60, 0.4));
      const vs = VEHICLES[customerId];
      const seq = 1 + Math.floor(rnd(`${customerId}${d}s`) * 3);
      rows.push({
        id: `${customerId}-${d}-cs`,
        transactionType: 'Credit Sale',
        amount: r2(qty * fuel.price),
        notes: null,
        createdAt: at(d, seq === 1 ? '09:40' : seq === 2 ? '16:10' : '23:05'),
        businessDate: d,
        shiftBusinessDate: d,
        shiftSequence: seq,
        productName: fuel.name,
        quantity: qty,
        unit: 'L',
        vehicleRegistration: vs[Math.floor(rnd(`${customerId}${d}v`) * vs.length)],
      });
    }
  }
  for (const col of collections().filter((x) => x.customerId === customerId)) {
    rows.push({
      id: col.id,
      transactionType: 'Collection',
      amount: col.amount,
      notes: col.notes,
      createdAt: at(col.entryDate, '11:30'),
      businessDate: col.entryDate,
      method: col.method,
      reference: col.reference,
    });
  }
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Customer collections (office records). Mapped into the money ledger too. */
export function collections() {
  const out: any[] = [];
  const plan: [string, number, string, number, string | null][] = [
    // customerId, day-of-month, method, amount, reference
    ['c-kml', 2, 'BankTransfer', 140000, 'NEFT N2741188'],
    ['c-mal', 4, 'BankTransfer', 100000, 'RTGS HDFCR5210'],
    ['c-sjs', 6, 'Cash', 45000, null],
    ['c-pcon', 8, 'UPI', 70000, 'UPI 6281…4431'],
    ['c-aluva', 9, 'Cash', 26000, null],
    ['c-kml', 12, 'BankTransfer', 100000, 'NEFT N2799031'],
    ['c-mal', 13, 'Cash', 80000, null],
    ['c-sjs', 14, 'BankTransfer', 40000, 'NEFT SBIN4471'],
    ['c-pcon', 18, 'BankTransfer', 60000, 'NEFT PCON0918'],
    ['c-aluva', 24, 'Cash', 22000, null],
  ];
  for (const month of [HISTORY_START, MONTH_START]) {
    for (const [cid, dom, method, amount, reference] of plan) {
      const d = `${month.slice(0, 8)}${String(dom).padStart(2, '0')}`;
      if (d > TODAY) continue;
      out.push({
        id: `col-${cid}-${d}`,
        customerId: cid,
        customerName: CUSTOMERS.find((c) => c.id === cid)!.name,
        entryDate: d,
        method,
        amount,
        reference,
        notes: null,
        accountId: method === 'Cash' ? 'acc-cash' : method === 'UPI' ? 'acc-clear' : 'acc-hdfc',
      });
    }
  }
  return out;
}

export function customers() {
  return CUSTOMERS.map((c) => {
    const balance = customerLedger(c.id).reduce(
      (a, r) => a + (r.transactionType === 'Collection' ? -r.amount : r.amount),
      0,
    );
    return {
      ...c,
      isActive: true,
      isPrepaid: false,
      settlementCycle: 'OPEN',
      currentBalance: r2(balance),
      metadata: { gstin: c.customerType === 'Fleet' ? '32AABCK1234M1Z5' : null },
    };
  });
}

export const SUPPLIERS = [
  { id: 's-ioc', name: 'Indian Oil Corporation Ltd', gstin: '32AAACI1681G1ZN', phone: '18002333555' },
  { id: 's-castrol', name: 'Castrol India Ltd', gstin: '32AAACC1206D1ZE', phone: '4842567890' },
  { id: 's-gulf', name: 'Gulf Oil Lubricants India', gstin: '29AACCG0527D1ZJ', phone: '8040123456' },
];

/** Fuel invoices (every ~3 days) and RTGS payments from HDFC. */
export function supplierRows(supplierId: string) {
  const rows: any[] = [];
  const all = days(HISTORY_START, TODAY);
  if (supplierId === 's-ioc') {
    rows.push({ id: 'ioc-open', transactionType: 'Opening Balance', amount: 412000, notes: 'As on migration', createdAt: at(HISTORY_START, '09:00'), businessDate: HISTORY_START });
    all.forEach((d, i) => {
      if (i % 3 === 0) {
        const fuel = i % 6 === 0 ? FUELS[0] : FUELS[1];
        const qty = i % 6 === 0 ? 12000 : 16000;
        rows.push({
          id: `ioc-pur-${d}`,
          transactionType: 'Purchase',
          amount: r2(qty * fuel.cost),
          notes: null,
          createdAt: at(d, '08:30'),
          businessDate: d,
          productName: fuel.name,
          quantity: qty,
          unit: 'L',
          invoiceNumber: `IOC/KOC/${d.slice(2, 4)}${d.slice(5, 7)}/${48000 + i * 7}`,
          tankerNumber: i % 2 ? 'KL-07-BX-4410' : 'KL-07-CF-2287',
        });
      }
      if (i % 3 === 1) {
        rows.push({
          id: `ioc-pay-${d}`,
          transactionType: 'Payment',
          amount: 1300000,
          notes: null,
          createdAt: at(d, '10:15'),
          businessDate: d,
          method: 'BANK',
          fundingAccountName: 'HDFC ••4512',
          accountId: 'acc-hdfc',
        });
      }
    });
  } else if (supplierId === 's-castrol') {
    for (const p of lubePurchases().filter((x) => x.supplierId === supplierId)) {
      rows.push({ id: p.id, transactionType: 'Purchase', amount: p.lineTotal, notes: null, createdAt: at(p.entryDate, '13:00'), businessDate: p.entryDate, productName: p.productName, quantity: p.quantity, unit: 'Nos', invoiceNumber: p.invoiceNumber });
    }
    rows.push({ id: 'cas-pay', transactionType: 'Payment', amount: 40000, notes: null, createdAt: at(add(TODAY, -6), '10:00'), businessDate: add(TODAY, -6), method: 'BANK', fundingAccountName: 'SBI ••0931', accountId: 'acc-sbi' });
  } else if (supplierId === 's-gulf') {
    for (const p of lubePurchases().filter((x) => x.supplierId === supplierId)) {
      rows.push({ id: p.id, transactionType: 'Purchase', amount: p.lineTotal, notes: null, createdAt: at(p.entryDate, '13:00'), businessDate: p.entryDate, productName: p.productName, quantity: p.quantity, unit: 'Nos', invoiceNumber: p.invoiceNumber });
    }
  }
  return rows.filter((r) => r.businessDate <= TODAY).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function suppliers() {
  return SUPPLIERS.map((s) => {
    const balance = supplierRows(s.id).reduce(
      (a, r) => a + (r.transactionType === 'Payment' ? -r.amount : r.amount),
      0,
    );
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      isActive: true,
      currentBalance: r2(balance),
      metadata: { gstin: s.gstin },
    };
  });
}

// ---------------------------------------------------------------- GST / VAT registers

function lubePurchases() {
  const plan: [string, number, (typeof MERCH)[number], number][] = [
    ['s-castrol', 3, MERCH[1], 48],
    ['s-castrol', 17, MERCH[1], 36],
    ['s-gulf', 6, MERCH[0], 60],
    ['s-gulf', 6, MERCH[2], 24],
    ['s-castrol', 11, MERCH[1], 24],
    ['s-gulf', 21, MERCH[0], 48],
  ];
  const out: any[] = [];
  for (const month of [HISTORY_START, MONTH_START]) {
    plan.forEach(([sid, dom, product, qty], i) => {
      const d = `${month.slice(0, 8)}${String(dom).padStart(2, '0')}`;
      if (d > TODAY) return;
      const s = SUPPLIERS.find((x) => x.id === sid)!;
      const taxable = r2(qty * product.cost);
      const inter = sid === 's-gulf';
      const gst = r2(taxable * 0.18);
      out.push({
        id: `lp-${d}-${i}`,
        supplierId: sid,
        entryDate: d,
        businessDate: d,
        supplierName: s.name,
        supplierGstin: s.gstin,
        invoiceNumber: sid === 's-castrol' ? `CIL/${d.slice(5, 7)}/${7731 + i}` : `GOL-KA-${22140 + i}`,
        documentNumber: `PUR-${String(300 + i).padStart(6, '0')}`,
        productName: product.name,
        productCode: product.code,
        quantity: qty,
        gstRate: 18,
        taxableAmount: taxable,
        cgst: inter ? 0 : r2(gst / 2),
        sgst: inter ? 0 : r2(gst / 2),
        igst: inter ? gst : 0,
        cess: 0,
        lineTotal: r2(taxable + gst),
      });
    });
  }
  return out;
}

export const purchaseGst = (from?: string | null, to?: string | null) =>
  lubePurchases().filter((p) => inRange(p.entryDate, from, to));

export const incomeGst = (from?: string | null, to?: string | null) =>
  allIncome().filter((i) => inRange(i.entryDate, from, to));

const HSN: Record<string, string> = { 'p-cool': '38200000', 'p-dw': '28510010' };
/** Merchandise sales (counter bills) — the Invoices list and the GST sales register. */
function merchSales() {
  const out: any[] = [];
  let n = 4120;
  let inv = 38;
  for (const d of days(HISTORY_START, TODAY)) {
    const { merch } = dayFigures(d);
    for (const m of merch) {
      if (!m.qty) continue;
      n += 1;
      const total = m.qty * m.price;
      const named = rnd(`${d}${m.id}buyer`);
      const buyer =
        named < 0.25
          ? CUSTOMERS[Math.floor(named * 20) % CUSTOMERS.length].name
          : named < 0.35
            ? 'Thomas Auto Garage'
            : named < 0.4
              ? 'Nilgiri Freight Carriers (TN)'
              : null;
      const invoiced = buyer != null && rnd(`${d}${m.id}inv`) < 0.8;
      out.push({
        id: `sale-${d}-${m.id}`,
        businessDate: d,
        documentNumber: `SAL-${String(n).padStart(6, '0')}`,
        saleType: 'Merchandise',
        customerName: buyer,
        productName: m.name,
        hsnCode: HSN[m.id] ?? '27101980',
        quantity: m.qty,
        totalAmount: total,
        invoiceNumber: invoiced ? `INV/2627/${String(++inv).padStart(6, '0')}` : null,
      });
    }
  }
  return out;
}

export const sales = (from?: string | null, to?: string | null) =>
  merchSales().filter((s) => inRange(s.businessDate, from, to));

export function salesTaxRegister(from?: string | null, to?: string | null) {
  const out: any[] = [];
  for (const s of sales(from, to)) {
    const taxable = r2(s.totalAmount / 1.18);
    const gst = r2(s.totalAmount - taxable);
    const inter = s.customerName === 'Nilgiri Freight Carriers (TN)';
    out.push({
      id: `tax-${s.id}`,
      businessDate: s.businessDate,
      documentNumber: s.invoiceNumber ?? s.documentNumber,
      productName: s.productName,
      hsnCode: s.hsnCode,
      customerName: s.customerName,
      quantity: s.quantity,
      taxCategory: 'GST',
      gstRate: 18,
      interState: inter,
      taxableAmount: taxable,
      cgst: inter ? 0 : r2(gst / 2),
      sgst: inter ? 0 : r2(gst / 2),
      igst: inter ? gst : 0,
      cess: 0,
      lineTotal: s.totalAmount,
    });
  }
  // Fuel VAT: one line per fuel per day (Kerala KGST on MS 30.08%, HSD 22.76%).
  const vatRate: Record<string, number> = { 'p-ms': 30.08, 'p-hsd': 22.76, 'p-xp': 30.08 };
  for (const d of days(HISTORY_START, TODAY).filter((x) => inRange(x, from, to))) {
    for (const f of dayFigures(d).fuel) {
      const rate = vatRate[f.id];
      const taxable = r2(f.salesValue / (1 + rate / 100));
      out.push({
        id: `vat-${d}-${f.id}`,
        businessDate: d,
        documentNumber: `DSR-${d.replaceAll('-', '')}`,
        productName: f.name,
        quantity: f.netVolume,
        taxCategory: 'FUEL_VAT',
        vatRate: rate,
        taxableAmount: taxable,
        vat: r2(f.salesValue - taxable),
        lineTotal: f.salesValue,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- money ledger

export const ACCOUNTS = [
  { accountId: 'acc-cash', accountType: 'CASH_IN_HAND', accountName: 'Cash in Hand', shared: false, isActive: true, base: 48250 },
  { accountId: 'acc-petty', accountType: 'PETTY_CASH', accountName: 'Petty Cash', shared: false, isActive: true, base: 5000 },
  { accountId: 'acc-hdfc', accountType: 'BANK', accountName: 'HDFC ••4512', shared: false, isActive: true, base: 1235400 },
  { accountId: 'acc-sbi', accountType: 'BANK', accountName: 'SBI ••0931', shared: false, isActive: true, base: 212800 },
  { accountId: 'acc-icici', accountType: 'BANK', accountName: 'Old ICICI', shared: false, isActive: false, base: 0 },
  { accountId: 'acc-clear', accountType: 'MERCHANT_CLEARING', accountName: 'Pine Labs card/UPI', shared: false, isActive: true, base: 0 },
  { accountId: 'acc-cms', accountType: 'CMS', accountName: 'IOCL XTRAPOWER CMS', shared: false, isActive: true, base: 18400 },
  { accountId: 'acc-owner', accountType: 'OWNER', accountName: 'Owner — Thomas Mathew', shared: false, isActive: true, base: 50000 },
  { accountId: 'acc-ho', accountType: 'BANK', accountName: 'Head office HDFC', shared: true, isActive: true, base: 2450000 },
];
const ACC = Object.fromEntries(ACCOUNTS.map((a) => [a.accountId, a]));

let movementCache: any[] | null = null;
/** Every ledger entry from HISTORY_START to today (both legs of transfers). */
function allMovements(): any[] {
  if (movementCache) return movementCache;
  const out: any[] = [];
  let seq = 0;
  const leg = (
    date: string,
    accountId: string,
    direction: 'in' | 'out',
    amount: number,
    sourceType: string,
    extra: { transferId?: string; notes?: string | null; partyName?: string | null; time?: string } = {},
  ) => {
    const a = ACC[accountId];
    out.push({
      id: `mv-${++seq}`,
      entryDate: date,
      accountId,
      accountType: a.accountType,
      accountName: a.accountName,
      direction,
      amount: r2(amount),
      sourceType,
      transferId: extra.transferId ?? null,
      notes: extra.notes ?? null,
      partyName: extra.partyName ?? null,
      createdAt: at(date, extra.time ?? '12:00'),
    });
  };
  const transfer = (date: string, from: string, to: string, amount: number, type: string, notes: string, time = '17:30') => {
    const id = `tr-${date}-${from}-${to}`;
    leg(date, from, 'out', amount, type, { transferId: id, notes, time });
    leg(date, to, 'in', amount, type, { transferId: id, notes, time });
  };

  const all = days(HISTORY_START, TODAY);
  all.forEach((d, i) => {
    const dom = Number(d.slice(8));
    const snap = dsrSnapshot(d, 3);
    if (d < TODAY) {
      // Shift cash (three shifts), card/UPI batches and OMC card sales.
      const cash = snap.cashSales;
      leg(d, 'acc-cash', 'in', cash * 0.36, 'SALE_CASH', { notes: 'Morning shift', time: '14:20' });
      leg(d, 'acc-cash', 'in', cash * 0.41, 'SALE_CASH', { notes: 'Evening shift', time: '22:20' });
      leg(d, 'acc-cash', 'in', cash * 0.23, 'SALE_CASH', { notes: 'Night shift', time: '23:55' });
      leg(d, 'acc-clear', 'in', snap.payments.card + snap.payments.upi * 0.4, 'SALE_CARD', { notes: 'Pine Labs batch', time: '23:50' });
      leg(d, 'acc-hdfc', 'in', snap.payments.upi * 0.6, 'SALE_CARD', { notes: 'Paytm UPI settlement', time: '23:55' });
      leg(d, 'acc-cms', 'in', jitter(`${d}cms`, 14800, 0.25), 'SALE_OMC', { notes: 'XTRAPOWER fleet cards', time: '23:50' });

    } else {
      leg(d, 'acc-cash', 'in', snap.cashSales * 0.95, 'SALE_CASH', { notes: 'Night + morning shift', time: '06:40' });
    }
    // Card/UPI settles next day to HDFC, net of MDR; yesterday's cash goes to the bank.
    if (i > 0) {
      const prev = all[i - 1];
      const ps = dsrSnapshot(prev, 3);
      transfer(d, 'acc-cash', 'acc-hdfc', Math.floor((ps.cashSales * 0.99) / 1000) * 1000, 'DEPOSIT', 'Cash deposit, Edappally branch', '11:00');
      const gross = r2(ps.payments.card + ps.payments.upi * 0.4);
      const fee = r2(ps.payments.card * 0.009);
      const id = `st-${d}`;
      leg(d, 'acc-clear', 'out', gross, 'SETTLEMENT', { transferId: id, notes: 'Pine Labs settlement', time: '10:05' });
      leg(d, 'acc-hdfc', 'in', gross - fee, 'SETTLEMENT', { transferId: id, notes: 'Pine Labs settlement', time: '10:05' });
      leg(d, 'acc-hdfc', 'out', fee, 'BANK_CHARGE', { notes: 'MDR on card batch', time: '10:05' });
    }
    // CMS settles weekly to SBI.
    if (dom % 7 === 0) {
      const id = `cms-${d}`;
      leg(d, 'acc-cms', 'out', 92000, 'SETTLEMENT', { transferId: id, notes: 'IOCL CMS weekly settlement', time: '15:00' });
      leg(d, 'acc-sbi', 'in', 92000, 'SETTLEMENT', { transferId: id, notes: 'IOCL CMS weekly settlement', time: '15:00' });
    }
    // Petty cash float top-up every Monday.
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1)
      transfer(d, 'acc-cash', 'acc-petty', 7500, 'TRANSFER', 'Petty cash float', '09:30');
    // HDFC → SBI to keep the second account funded.
    if (dom === 7) transfer(d, 'acc-hdfc', 'acc-sbi', 150000, 'TRANSFER', 'Fund SBI for salaries');
    // Sweep to the organisation's head-office account (shared, not in the report).
    if (dom === 10 && d >= MONTH_START) transfer(d, 'acc-hdfc', 'acc-ho', 200000, 'TRANSFER', 'Sweep to head office');
    if (dom === 28) leg(d, 'acc-sbi', 'in', 1240, 'INTEREST', { notes: 'Quarterly interest' });
  });
  for (const e of allExpenses()) {
    if (e.status === 'VOIDED') continue;
    leg(e.entryDate, e.accountId, 'out', e.amount, 'EXPENSE', { notes: `${e.categoryName} · ${e.description}`, time: '11:15' });
  }
  for (const inc of allIncome()) {
    leg(inc.entryDate, inc.accountId, 'in', inc.amount, 'INCOME', { partyName: inc.payer, notes: inc.categoryName, time: '12:30' });
  }
  for (const c of collections()) {
    leg(c.entryDate, c.accountId, 'in', c.amount, 'COLLECTION', { partyName: c.customerName, notes: c.reference, time: '11:30' });
  }
  for (const s of SUPPLIERS) {
    for (const r of supplierRows(s.id).filter((x) => x.transactionType === 'Payment')) {
      leg(r.businessDate, r.accountId, 'out', r.amount, 'SUPPLIER_PAYMENT', { partyName: s.name, notes: 'RTGS', time: '10:15' });
    }
  }
  movementCache = out;
  return out;
}

/** GET /finance/movements: the new per-account openings shape (old shape is a subset). */
export function financeMovements(from?: string | null, to?: string | null) {
  const mv = allMovements();
  const openings = ACCOUNTS.map((a) => {
    let opening = a.base;
    if (from) {
      for (const m of mv)
        if (m.accountId === a.accountId && m.entryDate < from)
          opening += m.direction === 'in' ? m.amount : -m.amount;
    }
    return {
      accountId: a.accountId,
      accountType: a.accountType,
      accountName: a.accountName,
      shared: a.shared,
      isActive: a.isActive,
      opening: r2(opening),
    };
  });
  const movements = mv
    .filter((m) => inRange(m.entryDate, from, to))
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
  return { movements, openings };
}

/** GET /transactions/money-movements (legacy party-ledger Cash / Bank / Owner buckets). */
export function moneyMovements(from?: string | null, to?: string | null) {
  const bucket = (t: string) =>
    t === 'CASH_IN_HAND' || t === 'PETTY_CASH' ? 'Cash' : t === 'OWNER' ? 'Owner' : 'Bank';
  const SOURCE: Record<string, string> = {
    COLLECTION: 'Collection',
    EXPENSE: 'Expense',
    SUPPLIER_PAYMENT: 'Supplier Payment',
  };
  const office = allMovements().filter((m) => SOURCE[m.sourceType] && !ACC[m.accountId].shared);
  const toRow = (m: any) => ({
    id: m.id,
    date: m.entryDate,
    createdAt: m.createdAt,
    account: bucket(m.accountType),
    direction: m.direction,
    label:
      m.sourceType === 'COLLECTION'
        ? `Collection · ${m.partyName}`
        : m.sourceType === 'SUPPLIER_PAYMENT'
          ? `Payment · ${m.partyName}`
          : String(m.notes ?? 'Expense').split(' · ')[0],
    source: SOURCE[m.sourceType],
    amount: m.amount,
  });
  const movements = office
    .filter((m) => inRange(m.entryDate, from, to))
    .map(toRow)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const openings: { account: string; opening: number }[] = [];
  if (from) {
    // Cash bucket opening carries the account opening balances, as the ledger does.
    const sums: Record<string, number> = { Cash: 53250, Bank: 1466600, Owner: 50000 };
    for (const m of office)
      if (m.entryDate < from) sums[bucket(m.accountType)] += m.direction === 'in' ? m.amount : -m.amount;
    for (const [account, opening] of Object.entries(sums)) openings.push({ account, opening: r2(opening) });
  }
  return { movements, openings };
}

// ---------------------------------------------------------------- attendant handovers

const ATTENDANTS = [
  { id: 'u-rajesh', name: 'Rajesh Kumar' },
  { id: 'u-suresh', name: 'Suresh Nair' },
  { id: 'u-anil', name: 'Anil Varghese' },
  { id: 'u-manoj', name: 'Manoj P. S.' },
];
const DUS = [
  { id: 'du-1', name: 'DU-1', nozzles: [{ id: 'nz-1a', name: 'N1', fuel: FUELS[0] }, { id: 'nz-1b', name: 'N2', fuel: FUELS[1] }] },
  { id: 'du-2', name: 'DU-2', nozzles: [{ id: 'nz-2a', name: 'N3', fuel: FUELS[0] }, { id: 'nz-2b', name: 'N4', fuel: FUELS[1] }] },
  { id: 'du-3', name: 'DU-3', nozzles: [{ id: 'nz-3a', name: 'N5', fuel: FUELS[1] }, { id: 'nz-3b', name: 'N6', fuel: FUELS[2] }] },
];
const TEMPLATES = [
  { seq: 1, name: 'Morning', end: '14:05' },
  { seq: 2, name: 'Evening', end: '22:05' },
  { seq: 3, name: 'Night', end: '06:05' },
];
/** Deliberate variances: [attendant, days ago, shift seq, amount]. */
const VARIANCE: [string, number, number, number][] = [
  ['u-rajesh', 3, 1, -850],
  ['u-rajesh', 9, 2, -120],
  ['u-suresh', 5, 2, 320],
  ['u-suresh', 11, 1, 50],
  ['u-manoj', 2, 3, -40],
  ['u-anil', 7, 1, 10],
];

let attendantCache: Map<string, any[]> | null = null;
function attendantShifts(): Map<string, any[]> {
  if (attendantCache) return attendantCache;
  const byAttendant = new Map<string, any[]>(ATTENDANTS.map((a) => [a.id, []]));
  const totalizer = new Map<string, number>(DUS.flatMap((du) => du.nozzles.map((n, i) => [n.id, 412000 + i * 98000 + du.id.length * 1000])));
  const all = days(MONTH_START, add(TODAY, -1));
  all.forEach((d, di) => {
    for (const t of TEMPLATES) {
      // Morning: DU-1/DU-2; Evening: DU-1/DU-2/DU-3; Night: DU-3 only.
      const dus = t.seq === 1 ? DUS.slice(0, 2) : t.seq === 2 ? DUS : [DUS[2]];
      dus.forEach((du, k) => {
        const att = ATTENDANTS[(di + t.seq + k) % ATTENDANTS.length];
        const nozzles = du.nozzles.map((n) => {
          const factor = t.seq === 3 ? 0.35 : t.seq === 2 ? 0.55 : 0.45;
          const vol = r2(jitter(`${d}${t.seq}${n.id}`, (n.fuel.perDay / 2.6) * factor * (n.fuel.code === 'XP95' ? 3 : 1), 0.2));
          const opening = totalizer.get(n.id)!;
          const testing = 5;
          const closing = r2(opening + vol + testing);
          totalizer.set(n.id, closing);
          return {
            nozzleId: n.id,
            nozzleName: n.name,
            productName: n.fuel.name,
            openingReading: opening,
            closingReading: closing,
            volumeSold: vol,
            testingVolume: testing,
            unitPrice: n.fuel.price,
          };
        });
        const expected = r2(nozzles.reduce((a, n) => a + n.volumeSold * (n.unitPrice ?? 0), 0));
        const card = r2(Math.round(expected * jitter(`${d}${du.id}c`, 0.1, 0.4)));
        const upi = r2(Math.round(expected * jitter(`${d}${du.id}u`, 0.26, 0.3)));
        const customer = CUSTOMERS[(di + t.seq + k) % CUSTOMERS.length];
        const creditLines =
          rnd(`${d}${t.seq}${du.id}cr`) < 0.6
            ? [
                (() => {
                  const fuel = du.nozzles[1].fuel;
                  const qty = r2(jitter(`${d}${du.id}q`, 60, 0.4));
                  const vs = VEHICLES[customer.id];
                  return {
                    transactionId: `cs-${d}-${t.seq}-${du.id}`,
                    customerId: customer.id,
                    customerName: customer.name,
                    vehicleRegistration: vs[0],
                    productName: fuel.name,
                    quantity: qty,
                    unit: 'L',
                    unitPrice: fuel.price,
                    amount: r2(qty * fuel.price),
                  };
                })(),
              ]
            : [];
        const credit = r2(creditLines.reduce((a, l) => a + l.amount, 0));
        const v = VARIANCE.find(([a, ago, seq]) => a === att.id && add(TODAY, -ago) === d && seq === t.seq);
        const variance = v ? v[3] : 0;
        const cash = r2(expected - card - upi - credit + variance);
        const billed = k === 0 ? r2(Math.round(jitter(`${d}${t.seq}b`, 880, 0.5))) : 0;
        const handoverProducts = k === 0 && t.seq !== 3 ? r2(Math.round(jitter(`${d}${t.seq}hp`, 460, 0.5))) : 0;
        const dispenser = {
          handoverId: `ho-${d}-${t.seq}-${du.id}`,
          duId: du.id,
          duName: du.name,
          cashHandedOver: cash,
          cardHandedOver: card,
          upiHandedOver: upi,
          creditHandedOver: credit,
          expectedFuelSales: expected,
          creditSales: credit,
          varianceAmount: variance,
          testingVolume: 10,
          terminals: [
            { terminalId: 'term-1', terminalName: 'Pine Labs POS 1', cardAmount: card, upiAmount: r2(upi * 0.4), batchRef: `B${d.slice(5).replace('-', '')}${t.seq}` },
            { terminalId: 'term-2', terminalName: 'Paytm Soundbox', cardAmount: 0, upiAmount: r2(upi - r2(upi * 0.4)), batchRef: null },
          ],
          nozzles,
        };
        byAttendant.get(att.id)!.push({
          shiftId: `sh-${d}-${t.seq}`,
          businessDate: d,
          shiftSequence: t.seq,
          shiftTemplateName: t.name,
          closedAt: at(t.seq === 3 ? add(d, 1) : d, t.end),
          dispensers: [dispenser],
          cashHandedOver: cash,
          cardHandedOver: card,
          upiHandedOver: upi,
          creditHandedOver: credit,
          expectedFuelSales: expected,
          billedSales: billed,
          handoverProductSales: handoverProducts,
          creditSales: credit,
          creditSaleLines: creditLines,
          varianceAmount: variance,
          testingVolume: 10,
        });
      });
    }
  });
  attendantCache = byAttendant;
  return byAttendant;
}

export function attendantReport(from: string, to: string, attendantId?: string | null) {
  const map = attendantShifts();
  const attendants = ATTENDANTS.filter((a) => !attendantId || a.id === attendantId)
    .map((a) => {
      const shifts = map.get(a.id)!.filter((s) => inRange(s.businessDate, from, to));
      const sum = (k: string) => r2(shifts.reduce((acc, s) => acc + s[k], 0));
      return {
        attendantId: a.id,
        attendantName: a.name,
        shiftsWorked: shifts.length,
        handoverCount: shifts.reduce((acc, s) => acc + s.dispensers.length, 0),
        totals: {
          cashHandedOver: sum('cashHandedOver'),
          cardHandedOver: sum('cardHandedOver'),
          upiHandedOver: sum('upiHandedOver'),
          creditHandedOver: sum('creditHandedOver'),
          expectedFuelSales: sum('expectedFuelSales'),
          billedSales: sum('billedSales'),
          handoverProductSales: sum('handoverProductSales'),
          creditSales: sum('creditSales'),
          varianceAmount: sum('varianceAmount'),
        },
        shifts: [...shifts].reverse(),
      };
    })
    .filter((a) => a.shiftsWorked > 0);
  return { stationId: STATION.id, from, to, generatedAt: new Date().toISOString(), attendants };
}

// ---------------------------------------------------------------- decantations

const TANKS = {
  t1: { id: 'tank-1', name: 'Tank 1 · MS 20 KL', product: FUELS[0] },
  t2: { id: 'tank-2', name: 'Tank 2 · HSD 20 KL', product: FUELS[1] },
  t3: { id: 'tank-3', name: 'Tank 3 · HSD 15 KL', product: FUELS[1] },
  t4: { id: 'tank-4', name: 'Tank 4 · XP95 10 KL', product: FUELS[2] },
};

interface LineSpec {
  tank: keyof typeof TANKS;
  before: number;
  received: number | null;
  sales: number;
  roDensity: number | null;
  invoiceDensity: number;
}
interface InvoiceSpec {
  product: (typeof FUELS)[number];
  purchaseId: string | null;
  invoiceNumber: string | null;
  invoiceQty: number | null;
}
interface VisitSpec {
  id: string;
  ago: number;
  doc: string;
  tanker: string;
  driver: string;
  chambers: { cap: number; dip: number; seal: boolean; mark: 'OK' | 'SHORT' | 'EXCESS'; emptied: boolean; tank: keyof typeof TANKS }[];
  lines: LineSpec[];
  invoices: InvoiceSpec[];
  flags?: { code: string; chamberNo?: number; message: string }[];
  notes?: string;
  pending?: boolean;
}

const VISITS: VisitSpec[] = [
  {
    id: 'dec-1', ago: 13, doc: 'DEC-2610-001', tanker: 'KL-07-BX-4410', driver: 'Shibu Thomas',
    chambers: [
      { cap: 4000, dip: 1012, seal: true, mark: 'OK', emptied: true, tank: 't1' },
      { cap: 4000, dip: 1010, seal: true, mark: 'OK', emptied: true, tank: 't1' },
      { cap: 4000, dip: 1011, seal: true, mark: 'OK', emptied: true, tank: 't1' },
    ],
    lines: [{ tank: 't1', before: 4120, received: 11962, sales: 310, roDensity: 744.6, invoiceDensity: 745.2 }],
    invoices: [{ product: FUELS[0], purchaseId: 'pur-ms-1', invoiceNumber: 'IOC/KOC/2610/48213', invoiceQty: 12000 }],
  },
  {
    id: 'dec-2', ago: 10, doc: 'DEC-2610-002', tanker: 'KL-07-CF-2287', driver: 'Biju K.',
    chambers: [
      { cap: 4000, dip: 1008, seal: true, mark: 'OK', emptied: true, tank: 't2' },
      { cap: 4000, dip: 1009, seal: true, mark: 'OK', emptied: true, tank: 't2' },
      { cap: 4000, dip: 1010, seal: true, mark: 'EXCESS', emptied: true, tank: 't3' },
      { cap: 4000, dip: 1007, seal: true, mark: 'OK', emptied: true, tank: 't3' },
    ],
    lines: [
      { tank: 't2', before: 5480, received: 9013, sales: 220, roDensity: 832.1, invoiceDensity: 831.8 },
      { tank: 't3', before: 3105, received: 7008, sales: 140, roDensity: 832.4, invoiceDensity: 831.8 },
    ],
    invoices: [{ product: FUELS[1], purchaseId: 'pur-hsd-1', invoiceNumber: 'IOC/KOC/2610/48240', invoiceQty: 16000 }],
  },
  {
    id: 'dec-3', ago: 7, doc: 'DEC-2610-003', tanker: 'KL-07-BX-4410', driver: 'Shibu Thomas',
    notes: 'Seal on chamber 3 found broken at arrival. Photo sent to IOCL depot.',
    flags: [
      { code: 'CHAMBER_SHORT', chamberNo: 2, message: 'Chamber 2 short — dip 985 mm vs 1,000 mm calibrated' },
      { code: 'SEAL_BROKEN', chamberNo: 3, message: 'Chamber 3 seal broken on arrival' },
    ],
    chambers: [
      { cap: 4000, dip: 1001, seal: true, mark: 'OK', emptied: true, tank: 't1' },
      { cap: 4000, dip: 985, seal: true, mark: 'SHORT', emptied: true, tank: 't2' },
      { cap: 4000, dip: 998, seal: false, mark: 'OK', emptied: true, tank: 't2' },
    ],
    lines: [
      { tank: 't1', before: 6230, received: 3991, sales: 180, roDensity: 745.0, invoiceDensity: 744.9 },
      { tank: 't2', before: 4870, received: 7940, sales: 260, roDensity: 830.9, invoiceDensity: 832.0 },
    ],
    invoices: [
      { product: FUELS[0], purchaseId: 'pur-ms-2', invoiceNumber: 'IOC/KOC/2610/48277', invoiceQty: 4000 },
      { product: FUELS[1], purchaseId: 'pur-hsd-2', invoiceNumber: 'IOC/KOC/2610/48278', invoiceQty: 8000 },
    ],
  },
  {
    id: 'dec-4', ago: 4, doc: 'DEC-2610-004', tanker: 'KL-07-CF-2287', driver: 'Biju K.',
    chambers: [
      { cap: 4000, dip: 1004, seal: true, mark: 'OK', emptied: true, tank: 't4' },
      { cap: 4000, dip: 1000, seal: true, mark: 'OK', emptied: true, tank: 't3' },
      { cap: 4000, dip: 1001, seal: true, mark: 'OK', emptied: true, tank: 't3' },
    ],
    lines: [
      { tank: 't4', before: 2210, received: 4003, sales: 40, roDensity: 752.3, invoiceDensity: 752.0 },
      { tank: 't3', before: 4410, received: 8000, sales: 190, roDensity: 831.5, invoiceDensity: 831.6 },
    ],
    invoices: [
      { product: FUELS[2], purchaseId: null, invoiceNumber: null, invoiceQty: null },
      { product: FUELS[1], purchaseId: 'pur-hsd-3', invoiceNumber: 'IOC/KOC/2610/48311', invoiceQty: 8000 },
    ],
  },
  {
    id: 'dec-5', ago: 0, doc: 'DEC-2610-005', tanker: 'KL-07-BX-4410', driver: 'Shibu Thomas', pending: true,
    notes: 'Tank settling — after dip at 10:30.',
    chambers: [
      { cap: 4000, dip: 1010, seal: true, mark: 'OK', emptied: true, tank: 't1' },
      { cap: 4000, dip: 1009, seal: true, mark: 'OK', emptied: true, tank: 't1' },
      { cap: 4000, dip: 1011, seal: true, mark: 'OK', emptied: true, tank: 't1' },
    ],
    lines: [{ tank: 't1', before: 3880, received: null, sales: 0, roDensity: null, invoiceDensity: 745.4 }],
    invoices: [{ product: FUELS[0], purchaseId: 'pur-ms-3', invoiceNumber: 'IOC/KOC/2610/48350', invoiceQty: 12000 }],
  },
];

function buildVisit(v: VisitSpec) {
  const date = add(TODAY, -v.ago);
  const start = at(date, '08:10');
  const end = at(date, '09:05');
  const tankLines = v.lines.map((l, i) => {
    const t = TANKS[l.tank];
    const measured = l.received != null;
    return {
      id: `${v.id}-tl-${i}`,
      tankId: t.id,
      tankName: t.name,
      productId: t.product.id,
      productName: t.product.name,
      productCode: t.product.code,
      beforeDip: l.before,
      beforeDipAt: start,
      afterDip: measured ? r2(l.before + l.received! - l.sales) : null,
      afterDipAt: measured ? at(date, '10:35') : null,
      salesDuring: l.sales,
      receivedQty: l.received,
      measuredBy: measured ? 'AFTER_DIP' : null,
      measuredAt: measured ? at(date, '10:35') : null,
      status: measured ? 'MEASURED' : 'PENDING_MEASUREMENT',
      roDensity: l.roDensity,
      invoiceDensity: l.invoiceDensity,
      densityDeviation: l.roDensity == null ? null : r2(l.roDensity - l.invoiceDensity),
    };
  });
  const chambers = v.chambers.map((c, i) => ({
    id: `${v.id}-ch-${i + 1}`,
    chamberNo: i + 1,
    capacityL: c.cap,
    dipMm: c.dip,
    sealOk: c.seal,
    mark: c.mark,
    emptied: c.emptied,
    tankLineId: tankLines.find((tl) => tl.tankId === TANKS[c.tank].id)?.id ?? null,
    tankName: TANKS[c.tank].name,
  }));
  const shortCount = chambers.filter((c) => c.mark === 'SHORT').length;
  const excessCount = chambers.filter((c) => c.mark === 'EXCESS').length;
  const notEmptiedCount = chambers.filter((c) => !c.emptied).length;
  const sealsBrokenCount = chambers.filter((c) => c.sealOk === false).length;
  const invoiceLinks = v.invoices.map((inv) => {
    const received = tankLines
      .filter((tl) => tl.productId === inv.product.id)
      .reduce<number | null>((a, tl) => (tl.receivedQty == null ? a : (a ?? 0) + tl.receivedQty), null);
    const linked = !!inv.purchaseId;
    const settled = linked && !v.pending;
    const variance = settled ? r2(received! - inv.invoiceQty!) : null;
    const varianceType = variance == null ? null : variance < 0 ? 'SHORT' : variance > 0 ? 'EXCESS' : 'EXACT';
    return {
      productId: inv.product.id,
      productName: inv.product.name,
      productCode: inv.product.code,
      purchaseId: inv.purchaseId,
      invoiceNumber: inv.invoiceNumber,
      purchaseDocumentNumber: inv.purchaseId ? `PUR-${inv.purchaseId.toUpperCase()}` : null,
      invoiceQty: inv.invoiceQty,
      receivedQty: received,
      varianceQty: variance,
      linkedVisitCount: linked ? 1 : 0,
      status: !linked ? 'NOT_LINKED' : v.pending ? 'PENDING_MEASUREMENT' : 'LINKED',
      statusLabel: !linked
        ? 'Purchase not linked'
        : v.pending
          ? 'Pending measurement'
          : varianceType === 'SHORT'
            ? 'Short'
            : varianceType === 'EXCESS'
              ? 'Excess'
              : 'Exact',
      varianceType,
    };
  });
  const settledLinks = invoiceLinks.filter((l) => l.status === 'LINKED');
  const flags = [...(v.flags ?? [])];
  for (const l of invoiceLinks)
    if (l.status === 'NOT_LINKED')
      flags.push({ code: 'PURCHASE_NOT_LINKED', message: `${l.productName} purchase not linked` } as any);
  return {
    id: v.id,
    date,
    documentNumber: v.doc,
    tankerNumber: v.tanker,
    driverName: v.driver,
    unloadStartedAt: start,
    unloadEndedAt: end,
    status: v.pending ? 'PENDING_MEASUREMENT' : 'MEASURED',
    flags,
    notes: v.notes ?? null,
    chamberSummary: {
      totalChambers: chambers.length,
      shortCount,
      excessCount,
      notEmptiedCount,
      sealsBrokenCount,
      hasTransitDiscrepancy: shortCount + excessCount + notEmptiedCount + sealsBrokenCount > 0,
    },
    chambers,
    tankLines,
    invoiceLinks,
    summary: {
      shortChambers: shortCount,
      excessChambers: excessCount,
      notEmptiedChambers: notEmptiedCount,
      sealsBroken: sealsBrokenCount,
      transitDiscrepancies: shortCount + excessCount + notEmptiedCount + sealsBrokenCount,
      settledInvoiceVarianceQty: settledLinks.length
        ? r2(settledLinks.reduce((a, l) => a + (l.varianceQty ?? 0), 0))
        : null,
      settlingInvoiceCount: invoiceLinks.filter((l) => l.status === 'PENDING_MEASUREMENT').length,
    },
    totalReceivedQty: r2(tankLines.reduce((a, tl) => a + (tl.receivedQty ?? 0), 0)),
    totalInvoiceQty: r2(settledLinks.reduce((a, l) => a + (l.invoiceQty ?? 0), 0)),
    totalVarianceQty:
      invoiceLinks.length && invoiceLinks.every((l) => l.status === 'LINKED')
        ? r2(settledLinks.reduce((a, l) => a + (l.varianceQty ?? 0), 0))
        : null,
  };
}

export function decantationReport(from: string, to: string) {
  const visits = VISITS.map(buildVisit)
    .filter((v) => inRange(v.date, from, to))
    .sort((a, b) => b.date.localeCompare(a.date));
  const links = visits.flatMap((v) => v.invoiceLinks.map((l) => ({ v, l })));
  const invoices = links
    .filter(({ l }) => l.purchaseId)
    .map(({ v, l }) => ({
      purchaseId: l.purchaseId!,
      productId: l.productId,
      productName: l.productName,
      productCode: l.productCode,
      invoiceNumber: l.invoiceNumber,
      purchaseDocumentNumber: l.purchaseDocumentNumber,
      supplierName: 'Indian Oil Corporation Ltd',
      invoiceQty: l.invoiceQty,
      receivedQty: l.status === 'LINKED' ? l.receivedQty : null,
      varianceQty: l.varianceQty,
      varianceType: l.varianceType,
      status: l.status === 'LINKED' ? 'SETTLED' : 'SETTLING',
      statusLabel: l.status === 'LINKED' ? l.statusLabel : 'Settling',
      visitCount: 1,
      visits: [{ id: v.id, documentNumber: v.documentNumber }],
    }));
  const productTotals = FUELS.map((f) => {
    const lines = visits.flatMap((v) => v.tankLines.filter((tl) => tl.productId === f.id));
    const fl = links.filter(({ l }) => l.productId === f.id);
    const settled = fl.filter(({ l }) => l.status === 'LINKED');
    const totalReceived = r2(lines.reduce((a, tl) => a + (tl.receivedQty ?? 0), 0));
    const settledReceived = r2(settled.reduce((a, { l }) => a + (l.receivedQty ?? 0), 0));
    const variance = r2(settled.reduce((a, { l }) => a + (l.varianceQty ?? 0), 0));
    return {
      productId: f.id,
      productName: f.name,
      productCode: f.code,
      totalReceivedQty: totalReceived,
      settledReceivedQty: settledReceived,
      totalInvoiceQty: r2(settled.reduce((a, { l }) => a + (l.invoiceQty ?? 0), 0)),
      totalVarianceQty: variance,
      pendingInvoiceQty: r2(fl.filter(({ l }) => l.status === 'PENDING_MEASUREMENT').reduce((a, { l }) => a + (l.invoiceQty ?? 0), 0)),
      pendingReceivedQty: r2(totalReceived - settledReceived),
      shortVarianceQty: r2(settled.reduce((a, { l }) => a - Math.min(0, l.varianceQty ?? 0), 0)),
      excessVarianceQty: r2(settled.reduce((a, { l }) => a + Math.max(0, l.varianceQty ?? 0), 0)),
      visitCount: new Set(visits.filter((v) => v.tankLines.some((tl) => tl.productId === f.id)).map((v) => v.id)).size,
      lineCount: lines.length,
      measuredLineCount: lines.filter((tl) => tl.status === 'MEASURED').length,
      pendingLineCount: lines.filter((tl) => tl.status !== 'MEASURED').length,
    };
  }).filter((p) => p.lineCount > 0);
  const sumP = (k: keyof (typeof productTotals)[number]) => r2(productTotals.reduce((a, p) => a + (p[k] as number), 0));
  const sumV = (k: string) => visits.reduce((a, v: any) => a + v.chamberSummary[k], 0);
  return {
    stationId: STATION.id,
    stationName: STATION.name,
    from,
    to,
    generatedAt: new Date().toISOString(),
    totals: {
      totalVisits: visits.length,
      measuredVisits: visits.filter((v) => v.status === 'MEASURED').length,
      pendingVisits: visits.filter((v) => v.status === 'PENDING_MEASUREMENT').length,
      flaggedVisits: visits.filter((v) => v.flags.length > 0).length,
      totalReceivedQty: sumP('totalReceivedQty'),
      settledReceivedQty: sumP('settledReceivedQty'),
      totalInvoiceQty: sumP('totalInvoiceQty'),
      totalVarianceQty: sumP('totalVarianceQty'),
      pendingInvoiceQty: sumP('pendingInvoiceQty'),
      pendingReceivedQty: sumP('pendingReceivedQty'),
      settlingInvoiceCount: invoices.filter((i) => i.status === 'SETTLING').length,
      transitDiscrepancies: sumV('shortCount') + sumV('excessCount') + sumV('notEmptiedCount') + sumV('sealsBrokenCount'),
      totalChambersShort: sumV('shortCount'),
      totalChambersExcess: sumV('excessCount'),
      totalChambersNotEmptied: sumV('notEmptiedCount'),
      totalSealsBroken: sumV('sealsBrokenCount'),
    },
    productTotals,
    invoices,
    visits,
  };
}
