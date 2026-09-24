import type { DssrSourceData } from './ports.js';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface FuelAgg {
  productId: string | null;
  productName: string;
  productCode: string;
  unit: string;
  grossVolume: number;
  testingVolume: number;
  netVolume: number;
  salesValue: number;
}

/**
 * Pure composition of a DSSR/P&L payload from a business day's source data.
 * Extracted from GenerateDssr so it can be reused for a *live* (non-persisted)
 * preview of the open day as well as the frozen snapshot written at close.
 * No I/O, no side effects — same inputs always yield the same payload.
 */
export function composeDssr(source: DssrSourceData): Record<string, unknown> {
  // --- Fuel (from immutable shift summaries; net-of-testing drives sales) ---
  let grossVolume = 0;
  let testingVolume = 0;
  let netVolume = 0;
  let fuelSalesValue = 0;
  let totalCashVariance = 0;
  const nozzleAgg: Record<string, FuelAgg & { nozzleId: string; nozzleName: string }> = {};
  const productAgg: Record<string, FuelAgg> = {};
  const shifts: {
    shiftId: string;
    /** Position within the business day; drives the readable `YYYYMMDD-N` label. */
    shiftSequence: number | null;
    templateName: string | null;
    closedAt: string | null;
    expectedDrawerCash: number;
    cashVariance: number;
    netVolume: number;
  }[] = [];

  for (const s of source.shiftSummaries) {
    const snap = s.snapshot as Record<string, any>;
    const sGross = Number(snap.totalVolume ?? 0);
    const sTesting = Number(snap.totalTesting ?? 0);
    const sNet = Number(snap.totalNetVolume ?? sGross - sTesting);
    grossVolume += sGross;
    testingVolume += sTesting;
    netVolume += sNet;
    fuelSalesValue += Number(snap.totalFuelSalesValue ?? 0);
    totalCashVariance += Number(snap.cashVariance ?? 0);
    shifts.push({
      shiftId: s.shiftId,
      shiftSequence: s.shiftSequence ?? null,
      templateName: s.templateName ?? null,
      closedAt: s.closedAt ?? null,
      expectedDrawerCash: Number(snap.expectedDrawerCash ?? 0),
      cashVariance: Number(snap.cashVariance ?? 0),
      netVolume: sNet,
    });
    for (const r of (snap.readings ?? []) as Record<string, any>[]) {
      const gross = Number(r.grossVolume ?? r.volumeSold ?? 0);
      const testing = Number(r.testingVolume ?? 0);
      const net = Number(r.netVolume ?? gross - testing);
      const salesValue = Number(r.salesValue ?? 0);
      const nKey = String(r.nozzleId);
      const pKey = r.productId ? String(r.productId) : 'unknown';
      const prod = source.products[pKey];
      const productName = prod?.name ?? 'Unknown';
      const productCode = prod?.code ?? '';
      const productUnit = prod?.unit ?? 'L';
      if (!nozzleAgg[nKey]) {
        nozzleAgg[nKey] = {
          nozzleId: nKey,
          nozzleName: source.nozzles[nKey] ?? 'Unknown',
          productId: r.productId ?? null,
          productName,
          productCode,
          unit: productUnit,
          grossVolume: 0,
          testingVolume: 0,
          netVolume: 0,
          salesValue: 0,
        };
      }
      nozzleAgg[nKey].grossVolume += gross;
      nozzleAgg[nKey].testingVolume += testing;
      nozzleAgg[nKey].netVolume += net;
      nozzleAgg[nKey].salesValue += salesValue;
      if (!productAgg[pKey]) {
        productAgg[pKey] = {
          productId: r.productId ?? null,
          productName,
          productCode,
          unit: productUnit,
          grossVolume: 0,
          testingVolume: 0,
          netVolume: 0,
          salesValue: 0,
        };
      }
      productAgg[pKey].grossVolume += gross;
      productAgg[pKey].testingVolume += testing;
      productAgg[pKey].netVolume += net;
      productAgg[pKey].salesValue += salesValue;
    }
  }

  // --- Merchandise sales (POS) by payment method ---
  const salesByMethod = { Cash: 0, Card: 0, UPI: 0, Credit: 0 } as Record<string, number>;
  for (const sale of source.sales)
    salesByMethod[sale.paymentMethod] = (salesByMethod[sale.paymentMethod] ?? 0) + sale.totalAmount;
  const merchandiseSalesValue = sum(source.sales.map((s) => s.totalAmount));

  // --- T5: output tax on sales, from the split frozen on each line ---
  const gstLines = source.saleItems.filter((i) => i.taxCategory === 'GST');
  const vatLines = source.saleItems.filter((i) => i.taxCategory === 'FUEL_VAT');
  const salesGst = {
    taxable: round2(sum(gstLines.map((i) => i.taxableAmount ?? 0))),
    cgst: round2(sum(gstLines.map((i) => i.cgst ?? 0))),
    sgst: round2(sum(gstLines.map((i) => i.sgst ?? 0))),
    igst: round2(sum(gstLines.map((i) => i.igst ?? 0))),
    cess: round2(sum(gstLines.map((i) => i.cess ?? 0))),
  };
  const salesVat = {
    taxable: round2(sum(vatLines.map((i) => i.taxableAmount ?? 0))),
    vat: round2(sum(vatLines.map((i) => i.vat ?? 0))),
  };
  const salesTax = {
    gst: {
      ...salesGst,
      total: round2(salesGst.cgst + salesGst.sgst + salesGst.igst + salesGst.cess),
    },
    // VAT is outside GST (no input credit for the buyer) — reported separately.
    vat: salesVat,
  };

  // --- Credit receivables created today, split normal vs fleet ---
  let normalCredit = 0;
  let fleetCredit = 0;
  for (const cs of source.creditSales) {
    if ((cs.customerType || '').toLowerCase() === 'fleet') fleetCredit += cs.amount;
    else normalCredit += cs.amount;
  }

  // --- Purchases (forecourt stock events; paying for them is an Office Record) ---
  const purchasesTotal = sum(source.purchases.map((p) => p.amount));

  // --- Tank dip / stock variance, split by unit basis (fuel = volume in L,
  // merchandise = item count) so the two never share a confusing unit column. ---
  const withStatus = (v: DssrSourceData['stockVariances'][number]) => ({
    ...v,
    status: v.varianceQuantity < 0 ? 'Loss' : v.varianceQuantity > 0 ? 'Gain' : 'OK',
  });
  const fuelStockVariance = source.stockVariances
    .filter((v) => v.inventoryType === 'BULK')
    .map(withStatus);
  const merchandiseStockVariance = source.stockVariances
    .filter((v) => v.inventoryType !== 'BULK')
    .map(withStatus);

  // --- P&L / COGS (FB2). COGS is captured against the cost basis effective now
  // (frozen into this snapshot at day close). Fuel COGS = Σ net volume × cost per
  // product; merchandise COGS = Σ line qty × cost per product. Fuel VAT is output
  // tax (not in cost); GST cost basis is pre-tax (input tax creditable). ---
  const costOf = (pid: string | null | undefined) =>
    pid && source.products[pid] ? Number(source.products[pid].costBasis || 0) : 0;
  const cogsFuel = round2(
    sum(Object.values(productAgg).map((pa) => pa.netVolume * costOf(pa.productId))),
  );
  const cogsMerch = round2(sum(source.saleItems.map((si) => si.quantity * costOf(si.productId))));
  const revenueFuel = round2(fuelSalesValue);
  const revenueMerch = round2(merchandiseSalesValue);
  const revenue = round2(revenueFuel + revenueMerch);
  const cogs = round2(cogsFuel + cogsMerch);
  // The DSSR is sales-only (ADR 0005): expenses and other income are Office
  // Records on their own Entry Dates, so net profit belongs to the P&L report.
  const grossMargin = round2(revenue - cogs);

  // Per-product margin (FB3): fuel from the nozzle roll-up, merchandise from the
  // sale line items — each { revenue, cogs, margin }. Powers the P&L breakdown.
  type ProductMargin = {
    productId: string;
    name: string;
    code: string;
    kind: 'fuel' | 'merchandise';
    quantity: number;
    revenue: number;
    cogs: number;
    margin: number;
    marginPct: number;
  };
  const byProduct: ProductMargin[] = [];
  for (const pa of Object.values(productAgg)) {
    if (!pa.productId) continue;
    const rev = round2(pa.salesValue);
    const c = round2(pa.netVolume * costOf(pa.productId));
    byProduct.push({
      productId: pa.productId,
      name: pa.productName,
      code: pa.productCode,
      kind: 'fuel',
      quantity: round2(pa.netVolume),
      revenue: rev,
      cogs: c,
      margin: round2(rev - c),
      marginPct: rev > 0 ? round2(((rev - c) / rev) * 100) : 0,
    });
  }
  const merchAgg: Record<string, { qty: number; revenue: number }> = {};
  for (const si of source.saleItems) {
    const m = merchAgg[si.productId] ?? { qty: 0, revenue: 0 };
    m.qty += si.quantity;
    m.revenue += si.revenue;
    merchAgg[si.productId] = m;
  }
  for (const [pid, m] of Object.entries(merchAgg)) {
    const prod = source.products[pid];
    const rev = round2(m.revenue);
    const c = round2(m.qty * costOf(pid));
    byProduct.push({
      productId: pid,
      name: prod?.name ?? 'Unknown',
      code: prod?.code ?? '',
      kind: 'merchandise',
      quantity: round2(m.qty),
      revenue: rev,
      cogs: c,
      margin: round2(rev - c),
      marginPct: rev > 0 ? round2(((rev - c) / rev) * 100) : 0,
    });
  }
  byProduct.sort((a, b) => b.margin - a.margin);

  return {
    shiftsIncluded: source.shiftSummaries.length,
    fuel: {
      // `totalVolume` kept = gross, for back-compat; net drives sales value.
      totalVolume: grossVolume,
      totalGrossVolume: grossVolume,
      totalTestingVolume: testingVolume,
      totalNetVolume: netVolume,
      totalSalesValue: fuelSalesValue,
      byProduct: Object.values(productAgg),
      nozzles: Object.values(nozzleAgg),
    },
    merchandise: {
      salesValue: merchandiseSalesValue,
      byPaymentMethod: salesByMethod,
    },
    salesTax,
    credit: {
      normalCredit,
      fleetCredit,
      total: normalCredit + fleetCredit,
    },
    purchases: { total: purchasesTotal },
    pnl: {
      revenueFuel,
      revenueMerch,
      revenue,
      cogsFuel,
      cogsMerch,
      cogs,
      grossMargin,
      byProduct,
    },
    fuelStockVariance,
    merchandiseStockVariance,
    drawer: { totalCashVariance },
    shifts,
  };
}
