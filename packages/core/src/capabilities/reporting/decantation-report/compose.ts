import { isBalancedQuantity } from '@pump/shared';
import type {
  DecantationReport,
  DecantationReportChamber,
  DecantationReportChamberSummary,
  DecantationReportInvoice,
  DecantationReportInvoiceLink,
  DecantationReportProductTotal,
  DecantationReportQuery,
  DecantationReportSource,
  DecantationReportTankLine,
  DecantationReportTotals,
  DecantationReportVisit,
  DecantationReportVisitSummary,
  DecantationPurchaseLinkSourceRow,
} from './ports.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type LinkRow = DecantationPurchaseLinkSourceRow;
type VarianceType = 'EXCESS' | 'SHORT' | 'EXACT';
const VARIANCE_LABEL: Record<VarianceType, string> = {
  EXCESS: 'Excess',
  SHORT: 'Short',
  EXACT: 'Exact',
};

/** Settled = variance computed at invoice level (all linked visits measured). */
const isSettled = (l: LinkRow) => l.varianceComputedAt !== null && l.varianceQty !== null;

/** Exact by the shared quantity rule (#556), else the variance's sign. */
const varianceTypeOf = (v: number): VarianceType =>
  isBalancedQuantity(v) ? 'EXACT' : v > 0 ? 'EXCESS' : 'SHORT';

/** Settled links of a visit, one per (purchase, product). */
function dedupeSettled(links: Map<string, LinkRow>): LinkRow[] {
  const seen = new Map<string, LinkRow>();
  for (const l of links.values()) {
    if (isSettled(l)) seen.set(`${l.purchaseId}:${l.productId}`, l);
  }
  return [...seen.values()];
}

function markSettled(row: DecantationReportInvoice, inv: DecantationReportInvoiceLink) {
  row.status = 'SETTLED';
  row.varianceQty = inv.varianceQty;
  row.varianceType = inv.varianceType;
  row.statusLabel = inv.statusLabel;
  row.invoiceQty = inv.invoiceQty;
  row.receivedQty =
    inv.invoiceQty !== null && inv.varianceQty !== null
      ? round3(inv.invoiceQty + inv.varianceQty)
      : null;
}

/**
 * Invoice density of a product on a purchase: the quantity-weighted average of
 * the items' non-null densities (the single one when there is only one).
 */
export function weightedInvoiceDensity(
  items: { quantity: number; invoiceDensity: number | null }[],
): number | null {
  const withDensity = items.filter((i) => i.invoiceDensity !== null);
  if (withDensity.length === 0) return null;
  if (withDensity.length === 1) return withDensity[0].invoiceDensity;
  const qty = withDensity.reduce((s, i) => s + i.quantity, 0);
  if (qty <= 0) {
    return withDensity.reduce((s, i) => s + (i.invoiceDensity as number), 0) / withDensity.length;
  }
  return withDensity.reduce((s, i) => s + (i.invoiceDensity as number) * i.quantity, 0) / qty;
}

export function composeDecantationReport(
  source: DecantationReportSource,
  query: DecantationReportQuery,
  generatedAt: string,
): DecantationReport {
  const { decantations, tankLines, chambers, links, stationName } = source;

  // Group tank lines by decantationId
  const linesByDecantation = new Map<string, typeof tankLines>();
  for (const l of tankLines) {
    const list = linesByDecantation.get(l.decantationId) ?? [];
    list.push(l);
    linesByDecantation.set(l.decantationId, list);
  }

  // Group chambers by decantationId
  const chambersByDecantation = new Map<string, typeof chambers>();
  for (const c of chambers) {
    const list = chambersByDecantation.get(c.decantationId) ?? [];
    list.push(c);
    chambersByDecantation.set(c.decantationId, list);
  }

  // Group links by decantationId -> productId -> link
  const linksByDecantation = new Map<string, Map<string, (typeof links)[number]>>();
  for (const link of links) {
    let decMap = linksByDecantation.get(link.decantationId);
    if (!decMap) {
      decMap = new Map();
      linksByDecantation.set(link.decantationId, decMap);
    }
    decMap.set(link.productId, link);
  }

  // Map tanks for resolving chamber tank line names
  const lineTankMap = new Map<string, string>();
  for (const l of tankLines) {
    lineTankMap.set(l.id, l.tankName);
  }

  const visits: DecantationReportVisit[] = [];

  for (const d of decantations) {
    const vLines = linesByDecantation.get(d.id) ?? [];
    const vChambers = chambersByDecantation.get(d.id) ?? [];
    const vLinks = linksByDecantation.get(d.id) ?? new Map();

    // Chamber summary
    const shortCount = vChambers.filter((c) => c.mark === 'SHORT').length;
    const excessCount = vChambers.filter((c) => c.mark === 'EXCESS').length;
    const notEmptiedCount = vChambers.filter((c) => c.emptied === false).length;
    const sealsBrokenCount = vChambers.filter((c) => c.sealOk === false).length;
    const chamberSummary: DecantationReportChamberSummary = {
      totalChambers: vChambers.length,
      shortCount,
      excessCount,
      notEmptiedCount,
      sealsBrokenCount,
      hasTransitDiscrepancy:
        shortCount > 0 || excessCount > 0 || notEmptiedCount > 0 || sealsBrokenCount > 0,
    };

    const formattedChambers: DecantationReportChamber[] = vChambers.map((c) => ({
      id: c.id,
      chamberNo: c.chamberNo,
      capacityL: c.capacityL !== null ? Number(c.capacityL) : null,
      dipMm: c.dipMm !== null ? Number(c.dipMm) : null,
      sealOk: c.sealOk,
      mark: c.mark,
      emptied: c.emptied,
      tankLineId: c.tankLineId,
      tankName: c.tankLineId ? (lineTankMap.get(c.tankLineId) ?? null) : null,
    }));

    // Formatted tank lines with density deviation against linked invoice
    const formattedTankLines: DecantationReportTankLine[] = vLines.map((l) => {
      const link = vLinks.get(l.productId);
      const invoiceDensity =
        link?.invoiceDensity !== undefined && link?.invoiceDensity !== null
          ? Number(link.invoiceDensity)
          : null;
      const roDensity = l.roDensity !== null ? Number(l.roDensity) : null;
      const densityDeviation =
        roDensity !== null && invoiceDensity !== null ? round2(roDensity - invoiceDensity) : null;

      return {
        id: l.id,
        tankId: l.tankId,
        tankName: l.tankName,
        productId: l.productId,
        productName: l.productName,
        productCode: l.productCode,
        beforeDip: Number(l.beforeDip),
        beforeDipAt: l.beforeDipAt,
        afterDip: l.afterDip !== null ? Number(l.afterDip) : null,
        afterDipAt: l.afterDipAt,
        salesDuring: Number(l.salesDuring),
        receivedQty: l.receivedQty !== null ? round3(Number(l.receivedQty)) : null,
        measuredBy: l.measuredBy,
        measuredAt: l.measuredAt,
        status: l.status,
        roDensity,
        invoiceDensity,
        densityDeviation,
      };
    });

    // Determine unique products in this visit
    const productIds = new Set<string>();
    for (const l of vLines) productIds.add(l.productId);
    for (const pid of vLinks.keys()) productIds.add(pid);

    const invoiceLinks: DecantationReportInvoiceLink[] = [];
    for (const pid of productIds) {
      const link = vLinks.get(pid);
      const linesForProduct = formattedTankLines.filter((l) => l.productId === pid);
      const productName = linesForProduct[0]?.productName ?? 'Product';
      const productCode = linesForProduct[0]?.productCode ?? '';
      const lineReceivedSum = linesForProduct.reduce((sum, l) => sum + (l.receivedQty ?? 0), 0);
      const anyLinePending =
        linesForProduct.length === 0 ||
        linesForProduct.some((l) => l.status === 'PENDING_MEASUREMENT');
      const base = {
        productId: pid,
        productName,
        productCode,
        receivedQty: linesForProduct.length > 0 ? round3(lineReceivedSum) : null,
      };

      if (!link) {
        invoiceLinks.push({
          ...base,
          purchaseId: null,
          invoiceNumber: null,
          purchaseDocumentNumber: null,
          invoiceQty: null,
          varianceQty: null,
          linkedVisitCount: 0,
          status: 'NOT_LINKED',
          statusLabel: 'Purchase not linked',
          varianceType: null,
        });
        continue;
      }
      const common = {
        ...base,
        purchaseId: link.purchaseId,
        invoiceNumber: link.invoiceNumber,
        purchaseDocumentNumber: link.purchaseDocumentNumber,
        invoiceQty: link.invoiceQty !== null ? round3(link.invoiceQty) : null,
        linkedVisitCount: Math.max(link.linkedVisitCount, 1),
      };
      if (anyLinePending || d.status === 'PENDING_MEASUREMENT') {
        invoiceLinks.push({
          ...common,
          varianceQty: null,
          status: 'PENDING_MEASUREMENT',
          statusLabel: 'Pending measurement',
          varianceType: null,
        });
      } else if (!isSettled(link)) {
        // Measured here, but the invoice waits on a sibling Decantation.
        invoiceLinks.push({
          ...common,
          varianceQty: null,
          status: 'SETTLING',
          statusLabel: 'Settling',
          varianceType: null,
        });
      } else {
        const varianceQty = round3(link.varianceQty as number);
        const varianceType = varianceTypeOf(varianceQty);
        invoiceLinks.push({
          ...common,
          varianceQty,
          status: 'LINKED',
          statusLabel: VARIANCE_LABEL[varianceType],
          varianceType,
        });
      }
    }

    const settledHere = dedupeSettled(vLinks);
    const settledVariance = settledHere.length
      ? round3(settledHere.reduce((s, l) => s + (l.varianceQty ?? 0), 0))
      : null;
    const linkedCount = [...vLinks.values()].length;
    const summary: DecantationReportVisitSummary = {
      shortChambers: shortCount,
      excessChambers: excessCount,
      notEmptiedChambers: notEmptiedCount,
      sealsBroken: sealsBrokenCount,
      transitDiscrepancies: shortCount + excessCount + notEmptiedCount + sealsBrokenCount,
      settledInvoiceVarianceQty: settledVariance,
      settlingInvoiceCount: invoiceLinks.filter(
        (i) => i.status === 'SETTLING' || i.status === 'PENDING_MEASUREMENT',
      ).length,
    };

    const totalReceivedQty = round3(
      formattedTankLines.reduce((acc, l) => acc + (l.receivedQty ?? 0), 0),
    );
    const totalInvoiceQty = round3(settledHere.reduce((acc, l) => acc + (l.invoiceQty ?? 0), 0));
    const allSettled =
      linkedCount > 0 &&
      invoiceLinks.every((inv) => inv.status === 'LINKED' || inv.status === 'NOT_LINKED') &&
      invoiceLinks.some((inv) => inv.status === 'LINKED');

    visits.push({
      id: d.id,
      date: d.businessDate,
      documentNumber: d.documentNumber,
      tankerNumber: d.tankerNumber,
      driverName: d.driverName,
      unloadStartedAt: d.unloadStartedAt,
      unloadEndedAt: d.unloadEndedAt,
      status: d.status,
      flags: d.flags ?? [],
      notes: d.notes,
      chamberSummary,
      chambers: formattedChambers,
      tankLines: formattedTankLines,
      invoiceLinks,
      summary,
      totalReceivedQty,
      totalInvoiceQty,
      totalVarianceQty: allSettled ? settledVariance : null,
    });
  }

  // Invoice section: one row per (purchase, product), however many visits it spans.
  const invoiceMap = new Map<string, DecantationReportInvoice>();
  for (const v of visits) {
    for (const inv of v.invoiceLinks) {
      if (!inv.purchaseId) continue;
      const key = `${inv.purchaseId}:${inv.productId}`;
      const srcLink = linksByDecantation.get(v.id)?.get(inv.productId);
      let row = invoiceMap.get(key);
      if (!row) {
        const settled = inv.status === 'LINKED';
        row = {
          purchaseId: inv.purchaseId,
          productId: inv.productId,
          productName: inv.productName,
          productCode: inv.productCode,
          invoiceNumber: inv.invoiceNumber,
          purchaseDocumentNumber: inv.purchaseDocumentNumber,
          supplierName: srcLink?.supplierName ?? null,
          invoiceQty: inv.invoiceQty,
          receivedQty: null,
          varianceQty: null,
          varianceType: null,
          status: 'SETTLING',
          statusLabel: 'Settling',
          visitCount: Math.max(inv.linkedVisitCount, 1),
          visits: [],
        };
        if (settled) markSettled(row, inv);
        invoiceMap.set(key, row);
      } else if (inv.status === 'LINKED' && row.status !== 'SETTLED') {
        markSettled(row, inv);
      }
      row.visits.push({ id: v.id, documentNumber: v.documentNumber });
    }
  }
  const invoices = [...invoiceMap.values()];
  const settledInvoiceKeys = new Set(
    invoices.filter((i) => i.status === 'SETTLED').map((i) => `${i.purchaseId}:${i.productId}`),
  );

  // Product totals: received of measured lines vs invoice qty of SETTLED invoices.
  type Acc = DecantationReportProductTotal & { visitIds: Set<string> };
  const productMap = new Map<string, Acc>();
  const accFor = (id: string, name: string, code: string): Acc => {
    let p = productMap.get(id);
    if (!p) {
      p = {
        productId: id,
        productName: name,
        productCode: code,
        totalReceivedQty: 0,
        settledReceivedQty: 0,
        totalInvoiceQty: 0,
        totalVarianceQty: 0,
        pendingInvoiceQty: 0,
        pendingReceivedQty: 0,
        shortVarianceQty: 0,
        excessVarianceQty: 0,
        visitCount: 0,
        lineCount: 0,
        measuredLineCount: 0,
        pendingLineCount: 0,
        visitIds: new Set(),
      };
      productMap.set(id, p);
    }
    return p;
  };

  for (const v of visits) {
    const vLinksMap = linksByDecantation.get(v.id);
    for (const l of v.tankLines) {
      const p = accFor(l.productId, l.productName, l.productCode);
      p.visitIds.add(v.id);
      p.lineCount++;
      if (l.status === 'MEASURED') {
        p.measuredLineCount++;
        const rec = l.receivedQty ?? 0;
        p.totalReceivedQty = round3(p.totalReceivedQty + rec);
        const link = vLinksMap?.get(l.productId);
        if (link && settledInvoiceKeys.has(`${link.purchaseId}:${l.productId}`)) {
          p.settledReceivedQty = round3(p.settledReceivedQty + rec);
        } else {
          p.pendingReceivedQty = round3(p.pendingReceivedQty + rec);
        }
      } else {
        p.pendingLineCount++;
      }
    }
    for (const inv of v.invoiceLinks)
      accFor(inv.productId, inv.productName, inv.productCode).visitIds.add(v.id);
  }
  for (const inv of invoices) {
    const p = accFor(inv.productId, inv.productName, inv.productCode);
    if (inv.status === 'SETTLED') {
      p.totalInvoiceQty = round3(p.totalInvoiceQty + (inv.invoiceQty ?? 0));
      const variance = inv.varianceQty ?? 0;
      p.totalVarianceQty = round3(p.totalVarianceQty + variance);
      const type = varianceTypeOf(variance);
      if (type === 'SHORT') p.shortVarianceQty = round3(p.shortVarianceQty + Math.abs(variance));
      else if (type === 'EXCESS') p.excessVarianceQty = round3(p.excessVarianceQty + variance);
    } else {
      p.pendingInvoiceQty = round3(p.pendingInvoiceQty + (inv.invoiceQty ?? 0));
    }
  }

  const productTotals: DecantationReportProductTotal[] = [...productMap.values()].map(
    ({ visitIds, ...p }) => ({ ...p, visitCount: visitIds.size }),
  );

  // Overall summary totals
  const totalVisits = visits.length;
  const measuredVisits = visits.filter((v) => v.status === 'MEASURED').length;
  const pendingVisits = visits.filter((v) => v.status === 'PENDING_MEASUREMENT').length;
  const flaggedVisits = visits.filter((v) => v.flags.length > 0).length;

  const sumP = (f: (p: DecantationReportProductTotal) => number) =>
    round3(productTotals.reduce((sum, p) => sum + f(p), 0));

  const totalChambersShort = visits.reduce((sum, v) => sum + v.chamberSummary.shortCount, 0);
  const totalChambersExcess = visits.reduce((sum, v) => sum + v.chamberSummary.excessCount, 0);
  const totalChambersNotEmptied = visits.reduce(
    (sum, v) => sum + v.chamberSummary.notEmptiedCount,
    0,
  );
  const totalSealsBroken = visits.reduce((sum, v) => sum + v.chamberSummary.sealsBrokenCount, 0);

  const totals: DecantationReportTotals = {
    totalVisits,
    measuredVisits,
    pendingVisits,
    flaggedVisits,
    totalReceivedQty: sumP((p) => p.totalReceivedQty),
    settledReceivedQty: sumP((p) => p.settledReceivedQty),
    totalInvoiceQty: sumP((p) => p.totalInvoiceQty),
    totalVarianceQty: sumP((p) => p.totalVarianceQty),
    pendingInvoiceQty: sumP((p) => p.pendingInvoiceQty),
    pendingReceivedQty: sumP((p) => p.pendingReceivedQty),
    settlingInvoiceCount: invoices.filter((i) => i.status === 'SETTLING').length,
    transitDiscrepancies:
      totalChambersShort + totalChambersExcess + totalChambersNotEmptied + totalSealsBroken,
    totalChambersShort,
    totalChambersExcess,
    totalChambersNotEmptied,
    totalSealsBroken,
  };

  return {
    stationId: query.stationId,
    stationName,
    from: query.from,
    to: query.to,
    generatedAt,
    totals,
    productTotals,
    invoices,
    visits,
  };
}
