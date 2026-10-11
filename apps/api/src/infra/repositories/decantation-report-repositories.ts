import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  DecantationChamberSourceRow,
  DecantationPurchaseLinkSourceRow,
  DecantationReportQuery,
  DecantationReportReader,
  DecantationReportSource,
  DecantationSourceRow,
  DecantationTankLineSourceRow,
} from '@pump/core';
import { weightedInvoiceDensity } from '@pump/core';

/** Null-preserving numeric conversion (NULL stays NULL, never 0). */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export class DrizzleDecantationReportReader implements DecantationReportReader {
  constructor(private readonly db: DbClient) {}

  async read(query: DecantationReportQuery): Promise<DecantationReportSource> {
    const stationRows = await this.db
      .select({ name: schema.stations.name })
      .from(schema.stations)
      .where(
        and(
          eq(schema.stations.id, query.stationId),
          eq(schema.stations.organizationId, query.organizationId),
        ),
      )
      .limit(1);

    const stationName = stationRows[0]?.name;

    const decFilters = [
      eq(schema.decantations.organizationId, query.organizationId),
      eq(schema.decantations.stationId, query.stationId),
      gte(schema.businessDays.businessDate, query.from),
      lte(schema.businessDays.businessDate, query.to),
    ];

    const decRows = await this.db
      .select({
        id: schema.decantations.id,
        businessDayId: schema.decantations.businessDayId,
        businessDate: schema.businessDays.businessDate,
        documentNumber: schema.decantations.documentNumber,
        tankerNumber: schema.decantations.tankerNumber,
        driverName: schema.decantations.driverName,
        unloadStartedAt: schema.decantations.unloadStartedAt,
        unloadEndedAt: schema.decantations.unloadEndedAt,
        chambersChecked: schema.decantations.chambersChecked,
        status: schema.decantations.status,
        flags: schema.decantations.flags,
        notes: schema.decantations.notes,
        createdAt: schema.decantations.createdAt,
      })
      .from(schema.decantations)
      .innerJoin(schema.businessDays, eq(schema.decantations.businessDayId, schema.businessDays.id))
      .where(and(...decFilters))
      .orderBy(desc(schema.businessDays.businessDate), desc(schema.decantations.createdAt));

    if (decRows.length === 0) {
      return {
        stationName,
        decantations: [],
        tankLines: [],
        chambers: [],
        links: [],
      };
    }

    const decIds = decRows.map((d) => d.id);

    // Query tank lines joined with tanks and products
    const lineRows = await this.db
      .select({
        id: schema.decantationTankLines.id,
        decantationId: schema.decantationTankLines.decantationId,
        tankId: schema.decantationTankLines.tankId,
        tankName: schema.tanks.name,
        productId: schema.decantationTankLines.productId,
        productName: schema.products.name,
        productCode: schema.products.code,
        beforeDip: schema.decantationTankLines.beforeDip,
        beforeDipAt: schema.decantationTankLines.beforeDipAt,
        observedDensity: schema.decantationTankLines.observedDensity,
        observedTempC: schema.decantationTankLines.observedTempC,
        roDensity: schema.decantationTankLines.roDensity,
        afterDip: schema.decantationTankLines.afterDip,
        afterDipAt: schema.decantationTankLines.afterDipAt,
        salesDuring: schema.decantationTankLines.salesDuring,
        receivedQty: schema.decantationTankLines.receivedQty,
        measuredBy: schema.decantationTankLines.measuredBy,
        measurementRefId: schema.decantationTankLines.measurementRefId,
        measuredAt: schema.decantationTankLines.measuredAt,
        status: schema.decantationTankLines.status,
        createdAt: schema.decantationTankLines.createdAt,
      })
      .from(schema.decantationTankLines)
      .innerJoin(
        schema.tanks,
        and(
          eq(schema.decantationTankLines.tankId, schema.tanks.id),
          eq(schema.tanks.organizationId, query.organizationId),
          eq(schema.tanks.stationId, query.stationId),
        ),
      )
      .innerJoin(
        schema.products,
        and(
          eq(schema.decantationTankLines.productId, schema.products.id),
          eq(schema.products.organizationId, query.organizationId),
        ),
      )
      .where(
        and(
          inArray(schema.decantationTankLines.decantationId, decIds),
          eq(schema.decantationTankLines.organizationId, query.organizationId),
          eq(schema.decantationTankLines.stationId, query.stationId),
        ),
      )
      .orderBy(asc(schema.decantationTankLines.createdAt), asc(schema.decantationTankLines.id));

    // Query chambers
    const chamberRows = await this.db
      .select({
        id: schema.decantationChambers.id,
        decantationId: schema.decantationChambers.decantationId,
        tankLineId: schema.decantationChambers.tankLineId,
        chamberNo: schema.decantationChambers.chamberNo,
        capacityL: schema.decantationChambers.capacityL,
        sealOk: schema.decantationChambers.sealOk,
        mark: schema.decantationChambers.mark,
        dipMm: schema.decantationChambers.dipMm,
        emptied: schema.decantationChambers.emptied,
      })
      .from(schema.decantationChambers)
      .where(
        and(
          inArray(schema.decantationChambers.decantationId, decIds),
          eq(schema.decantationChambers.organizationId, query.organizationId),
          eq(schema.decantationChambers.stationId, query.stationId),
        ),
      )
      .orderBy(asc(schema.decantationChambers.chamberNo));

    // Query links
    const linkDbRows = await this.db
      .select({
        id: schema.decantationPurchases.id,
        decantationId: schema.decantationPurchases.decantationId,
        purchaseId: schema.decantationPurchases.purchaseId,
        productId: schema.decantationPurchases.productId,
        receivedQty: schema.decantationPurchases.receivedQty,
        invoiceQty: schema.decantationPurchases.invoiceQty,
        varianceQty: schema.decantationPurchases.varianceQty,
        varianceComputedAt: schema.decantationPurchases.varianceComputedAt,
        invoiceNumber: schema.purchases.invoiceNumber,
        purchaseDocumentNumber: schema.purchases.documentNumber,
        supplierName: schema.suppliers.name,
      })
      .from(schema.decantationPurchases)
      .innerJoin(
        schema.purchases,
        and(
          eq(schema.decantationPurchases.purchaseId, schema.purchases.id),
          eq(schema.purchases.organizationId, query.organizationId),
          eq(schema.purchases.stationId, query.stationId),
        ),
      )
      .leftJoin(
        schema.suppliers,
        and(
          eq(schema.purchases.supplierId, schema.suppliers.id),
          eq(schema.suppliers.organizationId, query.organizationId),
        ),
      )
      .where(
        and(
          inArray(schema.decantationPurchases.decantationId, decIds),
          eq(schema.decantationPurchases.organizationId, query.organizationId),
          eq(schema.decantationPurchases.stationId, query.stationId),
        ),
      );

    // Query purchase items for densities and line quantities
    const purchaseIds = [
      ...new Set(linkDbRows.map((l) => l.purchaseId).filter(Boolean)),
    ] as string[];

    const purchaseItemRows =
      purchaseIds.length > 0
        ? await this.db
            .select({
              purchaseId: schema.purchaseItems.purchaseId,
              productId: schema.purchaseItems.productId,
              quantity: schema.purchaseItems.quantity,
              invoiceDensity: schema.purchaseItems.invoiceDensity,
            })
            .from(schema.purchaseItems)
            .innerJoin(
              schema.purchases,
              and(
                eq(schema.purchaseItems.purchaseId, schema.purchases.id),
                eq(schema.purchases.organizationId, query.organizationId),
                eq(schema.purchases.stationId, query.stationId),
              ),
            )
            .where(inArray(schema.purchaseItems.purchaseId, purchaseIds))
        : [];

    const itemsByKey = new Map<string, { quantity: number; invoiceDensity: number | null }[]>();
    for (const item of purchaseItemRows) {
      const key = `${item.purchaseId}:${item.productId}`;
      const list = itemsByKey.get(key) ?? [];
      list.push({
        quantity: Number(item.quantity),
        invoiceDensity: numOrNull(item.invoiceDensity),
      });
      itemsByKey.set(key, list);
    }

    // Every Decantation linked to these invoices (in or out of range): split count.
    const linkCountRows =
      purchaseIds.length > 0
        ? await this.db
            .select({
              purchaseId: schema.decantationPurchases.purchaseId,
              productId: schema.decantationPurchases.productId,
              n: count(),
            })
            .from(schema.decantationPurchases)
            .where(
              and(
                inArray(schema.decantationPurchases.purchaseId, purchaseIds),
                eq(schema.decantationPurchases.organizationId, query.organizationId),
                eq(schema.decantationPurchases.stationId, query.stationId),
              ),
            )
            .groupBy(schema.decantationPurchases.purchaseId, schema.decantationPurchases.productId)
        : [];
    const linkCounts = new Map(
      linkCountRows.map((r) => [`${r.purchaseId}:${r.productId}`, Number(r.n)]),
    );

    const decantations: DecantationSourceRow[] = decRows.map((d) => ({
      id: d.id,
      businessDayId: d.businessDayId,
      businessDate: d.businessDate,
      documentNumber: d.documentNumber,
      tankerNumber: d.tankerNumber,
      driverName: d.driverName,
      unloadStartedAt: d.unloadStartedAt ? d.unloadStartedAt.toISOString() : null,
      unloadEndedAt: d.unloadEndedAt ? d.unloadEndedAt.toISOString() : null,
      chambersChecked: d.chambersChecked,
      status: d.status as DecantationSourceRow['status'],
      flags: (d.flags ?? []) as DecantationSourceRow['flags'],
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    }));

    const tankLines: DecantationTankLineSourceRow[] = lineRows.map((l) => ({
      id: l.id,
      decantationId: l.decantationId,
      tankId: l.tankId,
      tankName: l.tankName,
      productId: l.productId,
      productName: l.productName,
      productCode: l.productCode,
      beforeDip: Number(l.beforeDip),
      beforeDipAt: l.beforeDipAt ? l.beforeDipAt.toISOString() : null,
      observedDensity: numOrNull(l.observedDensity),
      observedTempC: numOrNull(l.observedTempC),
      roDensity: numOrNull(l.roDensity),
      afterDip: numOrNull(l.afterDip),
      afterDipAt: l.afterDipAt ? l.afterDipAt.toISOString() : null,
      salesDuring: Number(l.salesDuring),
      receivedQty: numOrNull(l.receivedQty),
      measuredBy: l.measuredBy as DecantationTankLineSourceRow['measuredBy'],
      measurementRefId: l.measurementRefId,
      measuredAt: l.measuredAt ? l.measuredAt.toISOString() : null,
      status: l.status as DecantationTankLineSourceRow['status'],
      createdAt: l.createdAt.toISOString(),
    }));

    const chambers: DecantationChamberSourceRow[] = chamberRows.map((c) => ({
      id: c.id,
      decantationId: c.decantationId,
      tankLineId: c.tankLineId,
      chamberNo: c.chamberNo,
      capacityL: numOrNull(c.capacityL),
      sealOk: c.sealOk,
      mark: c.mark as DecantationChamberSourceRow['mark'],
      dipMm: numOrNull(c.dipMm),
      emptied: c.emptied,
    }));

    const links: DecantationPurchaseLinkSourceRow[] = linkDbRows.map((l) => {
      const key = `${l.purchaseId}:${l.productId}`;
      const items = itemsByKey.get(key);
      const invoiceQty =
        l.invoiceQty !== null
          ? numOrNull(l.invoiceQty)
          : items
            ? items.reduce((s, i) => s + i.quantity, 0)
            : null;

      return {
        id: l.id,
        decantationId: l.decantationId,
        purchaseId: l.purchaseId,
        productId: l.productId,
        receivedQty: numOrNull(l.receivedQty),
        invoiceQty,
        varianceQty: numOrNull(l.varianceQty),
        varianceComputedAt: l.varianceComputedAt ? l.varianceComputedAt.toISOString() : null,
        invoiceNumber: l.invoiceNumber,
        purchaseDocumentNumber: l.purchaseDocumentNumber,
        invoiceDensity: items ? weightedInvoiceDensity(items) : null,
        supplierName: l.supplierName,
        linkedVisitCount: linkCounts.get(key) ?? 1,
      };
    });

    return {
      stationName,
      decantations,
      tankLines,
      chambers,
      links,
    };
  }
}
