import type {
  DecantationReport,
  DecantationReportChamber,
  DecantationReportChamberSummary,
  DecantationReportInvoiceLink,
  DecantationReportProductTotal,
  DecantationReportQuery,
  DecantationReportSource,
  DecantationReportTankLine,
  DecantationReportTotals,
  DecantationReportVisit,
} from './ports.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function composeDecantationReport(
  source: DecantationReportSource,
  query: DecantationReportQuery,
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

      if (!link) {
        // Not linked to any purchase
        invoiceLinks.push({
          productId: pid,
          productName,
          productCode,
          purchaseId: null,
          invoiceNumber: null,
          purchaseDocumentNumber: null,
          invoiceQty: null,
          receivedQty: linesForProduct.length > 0 ? round3(lineReceivedSum) : null,
          varianceQty: null,
          status: 'NOT_LINKED',
          statusLabel: 'Purchase not linked',
          varianceType: null,
        });
      } else {
        const invoiceQty = link.invoiceQty !== null ? round3(Number(link.invoiceQty)) : null;
        const receivedQty =
          link.receivedQty !== null
            ? round3(Number(link.receivedQty))
            : linesForProduct.length > 0
              ? round3(lineReceivedSum)
              : null;

        if (anyLinePending || d.status === 'PENDING_MEASUREMENT') {
          invoiceLinks.push({
            productId: pid,
            productName,
            productCode,
            purchaseId: link.purchaseId,
            invoiceNumber: link.invoiceNumber,
            purchaseDocumentNumber: link.purchaseDocumentNumber,
            invoiceQty,
            receivedQty,
            varianceQty: null,
            status: 'PENDING_MEASUREMENT',
            statusLabel: 'Pending measurement',
            varianceType: null,
          });
        } else {
          // Both measured and linked
          let varianceQty: number | null = null;
          if (link.varianceQty !== null && link.varianceQty !== undefined) {
            varianceQty = round3(Number(link.varianceQty));
          } else if (receivedQty !== null && invoiceQty !== null) {
            varianceQty = round3(receivedQty - invoiceQty);
          }

          let varianceType: 'EXCESS' | 'SHORT' | 'EXACT' | null = null;
          let statusLabel = 'Exact';
          if (varianceQty !== null) {
            if (varianceQty > 0) {
              varianceType = 'EXCESS';
              statusLabel = 'Excess';
            } else if (varianceQty < 0) {
              varianceType = 'SHORT';
              statusLabel = 'Short';
            } else {
              varianceType = 'EXACT';
              statusLabel = 'Exact';
            }
          }

          invoiceLinks.push({
            productId: pid,
            productName,
            productCode,
            purchaseId: link.purchaseId,
            invoiceNumber: link.invoiceNumber,
            purchaseDocumentNumber: link.purchaseDocumentNumber,
            invoiceQty,
            receivedQty,
            varianceQty,
            status: 'LINKED',
            statusLabel,
            varianceType,
          });
        }
      }
    }

    const totalReceivedQty = round3(
      formattedTankLines.reduce((acc, l) => acc + (l.receivedQty ?? 0), 0),
    );
    const totalInvoiceQty = round3(
      invoiceLinks.reduce((acc, inv) => acc + (inv.invoiceQty ?? 0), 0),
    );
    const hasUncomputedVariance = invoiceLinks.some((inv) => inv.varianceQty === null);
    const totalVarianceQty = hasUncomputedVariance
      ? null
      : round3(invoiceLinks.reduce((acc, inv) => acc + (inv.varianceQty ?? 0), 0));

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
      totalReceivedQty,
      totalInvoiceQty,
      totalVarianceQty,
    });
  }

  // Calculate Product Totals across all visits in range
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      productCode: string;
      totalReceivedQty: number;
      totalInvoiceQty: number;
      totalVarianceQty: number;
      shortVarianceQty: number;
      excessVarianceQty: number;
      visitIds: Set<string>;
      lineCount: number;
      measuredLineCount: number;
      pendingLineCount: number;
    }
  >();

  for (const v of visits) {
    for (const l of v.tankLines) {
      let p = productMap.get(l.productId);
      if (!p) {
        p = {
          productId: l.productId,
          productName: l.productName,
          productCode: l.productCode,
          totalReceivedQty: 0,
          totalInvoiceQty: 0,
          totalVarianceQty: 0,
          shortVarianceQty: 0,
          excessVarianceQty: 0,
          visitIds: new Set(),
          lineCount: 0,
          measuredLineCount: 0,
          pendingLineCount: 0,
        };
        productMap.set(l.productId, p);
      }
      p.visitIds.add(v.id);
      p.lineCount++;
      if (l.status === 'MEASURED') {
        p.measuredLineCount++;
        p.totalReceivedQty = round3(p.totalReceivedQty + (l.receivedQty ?? 0));
      } else {
        p.pendingLineCount++;
      }
    }

    for (const inv of v.invoiceLinks) {
      let p = productMap.get(inv.productId);
      if (!p) {
        p = {
          productId: inv.productId,
          productName: inv.productName,
          productCode: inv.productCode,
          totalReceivedQty: 0,
          totalInvoiceQty: 0,
          totalVarianceQty: 0,
          shortVarianceQty: 0,
          excessVarianceQty: 0,
          visitIds: new Set(),
          lineCount: 0,
          measuredLineCount: 0,
          pendingLineCount: 0,
        };
        productMap.set(inv.productId, p);
      }
      p.visitIds.add(v.id);
      if (inv.invoiceQty !== null) {
        p.totalInvoiceQty = round3(p.totalInvoiceQty + inv.invoiceQty);
      }
      if (inv.varianceQty !== null) {
        p.totalVarianceQty = round3(p.totalVarianceQty + inv.varianceQty);
        if (inv.varianceQty < 0) {
          p.shortVarianceQty = round3(p.shortVarianceQty + Math.abs(inv.varianceQty));
        } else if (inv.varianceQty > 0) {
          p.excessVarianceQty = round3(p.excessVarianceQty + inv.varianceQty);
        }
      }
    }
  }

  const productTotals: DecantationReportProductTotal[] = [...productMap.values()].map((p) => ({
    productId: p.productId,
    productName: p.productName,
    productCode: p.productCode,
    totalReceivedQty: p.totalReceivedQty,
    totalInvoiceQty: p.totalInvoiceQty,
    totalVarianceQty: p.totalVarianceQty,
    shortVarianceQty: p.shortVarianceQty,
    excessVarianceQty: p.excessVarianceQty,
    visitCount: p.visitIds.size,
    lineCount: p.lineCount,
    measuredLineCount: p.measuredLineCount,
    pendingLineCount: p.pendingLineCount,
  }));

  // Overall summary totals
  const totalVisits = visits.length;
  const measuredVisits = visits.filter((v) => v.status === 'MEASURED').length;
  const pendingVisits = visits.filter((v) => v.status === 'PENDING_MEASUREMENT').length;
  const flaggedVisits = visits.filter((v) => v.flags.length > 0).length;

  const totalReceivedQty = round3(productTotals.reduce((sum, p) => sum + p.totalReceivedQty, 0));
  const totalInvoiceQty = round3(productTotals.reduce((sum, p) => sum + p.totalInvoiceQty, 0));
  const totalVarianceQty = round3(productTotals.reduce((sum, p) => sum + p.totalVarianceQty, 0));

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
    totalReceivedQty,
    totalInvoiceQty,
    totalVarianceQty,
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
    generatedAt: new Date().toISOString(),
    totals,
    productTotals,
    visits,
  };
}
