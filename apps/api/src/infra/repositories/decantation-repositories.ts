import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { roundDensity, shiftBusinessDate } from '@pump/shared';
import { schema, type DbExecutor } from '@pump/db';
import {
  DecantationMeasurementService,
  type DecantationPurchaseLink,
  type DecantationPurchaseRepository,
  type EventPublisher,
  type TankSalesReader,
  type Decantation,
  DecantationChamber,
  DecantationFlag,
  DecantationListQuery,
  DecantationRepository,
  DecantationStatus,
  DecantationTankLine,
  DensityReading,
  DensityReadingRepository,
  DensityReadingListQuery,
  DensityReadingWithContext,
  DensityTodayProductSummary,
  DensityTodaySummary,
} from '@pump/core';
import { DrizzleStockMovementRepository } from './inventory-repositories.js';
import { DrizzleProductRepository } from './product.repo.js';

const num = (v: string | null): number | null => (v == null ? null : Number(v));
const str = (v: number | null): string | null => (v == null ? null : String(v));
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
const dateOrNull = (s: string | null): Date | null => (s ? new Date(s) : null);

export class DrizzleDecantationRepository implements DecantationRepository {
  constructor(private readonly db: DbExecutor) {}

  private lineRow(l: DecantationTankLine, d: Decantation) {
    return {
      id: l.id,
      organizationId: d.organizationId,
      stationId: d.stationId,
      decantationId: d.id,
      tankId: l.tankId,
      productId: l.productId,
      beforeDip: String(l.beforeDip),
      beforeDipAt: dateOrNull(l.beforeDipAt),
      observedDensity: str(l.observedDensity),
      observedTempC: str(l.observedTempC),
      roDensity: str(l.roDensity),
      afterDip: str(l.afterDip),
      afterDipAt: dateOrNull(l.afterDipAt),
      salesDuring: String(l.salesDuring),
      receivedQty: str(l.receivedQty),
      measuredBy: l.measuredBy,
      measurementRefId: l.measurementRefId,
      measuredAt: dateOrNull(l.measuredAt),
      status: l.status,
    };
  }

  private chamberRow(c: DecantationChamber, d: Decantation) {
    return {
      id: c.id,
      organizationId: d.organizationId,
      stationId: d.stationId,
      decantationId: d.id,
      tankLineId: c.tankLineId,
      chamberNo: c.chamberNo,
      capacityL: str(c.capacityL),
      sealOk: c.sealOk,
      mark: c.mark,
      dipMm: str(c.dipMm),
      emptied: c.emptied,
    };
  }

  private headerRow(d: Decantation) {
    return {
      businessDayId: d.businessDayId,
      documentNumber: d.documentNumber,
      tankerNumber: d.tankerNumber,
      driverName: d.driverName,
      unloadStartedAt: dateOrNull(d.unloadStartedAt),
      unloadEndedAt: dateOrNull(d.unloadEndedAt),
      chambersChecked: d.chambersChecked,
      status: d.status,
      flags: d.flags,
      notes: d.notes,
      recordedBy: d.recordedBy,
      updatedAt: new Date(d.updatedAt),
    };
  }

  private async insertChildren(d: Decantation): Promise<void> {
    if (d.lines.length > 0)
      await this.db
        .insert(schema.decantationTankLines)
        .values(d.lines.map((l) => this.lineRow(l, d)));
    if (d.chambers.length > 0)
      await this.db
        .insert(schema.decantationChambers)
        .values(d.chambers.map((c) => this.chamberRow(c, d)));
  }

  async insert(d: Decantation): Promise<void> {
    await this.db.insert(schema.decantations).values({
      id: d.id,
      organizationId: d.organizationId,
      stationId: d.stationId,
      createdAt: new Date(d.createdAt),
      ...this.headerRow(d),
    });
    await this.insertChildren(d);
  }

  async replace(d: Decantation): Promise<void> {
    await this.db
      .update(schema.decantations)
      .set(this.headerRow(d))
      .where(
        and(
          eq(schema.decantations.id, d.id),
          eq(schema.decantations.organizationId, d.organizationId),
        ),
      );
    // Children reference each other: density readings -> lines, chambers -> lines.
    const oldLines = await this.db
      .select({ id: schema.decantationTankLines.id })
      .from(schema.decantationTankLines)
      .where(eq(schema.decantationTankLines.decantationId, d.id));
    if (oldLines.length > 0) {
      await this.db.delete(schema.densityReadings).where(
        and(
          eq(schema.densityReadings.organizationId, d.organizationId),
          inArray(
            schema.densityReadings.decantationTankLineId,
            oldLines.map((l) => l.id),
          ),
        ),
      );
    }
    await this.db
      .delete(schema.decantationChambers)
      .where(eq(schema.decantationChambers.decantationId, d.id));
    await this.db
      .delete(schema.decantationTankLines)
      .where(eq(schema.decantationTankLines.decantationId, d.id));
    await this.insertChildren(d);
  }

  private async hydrate(
    headers: Array<{ d: typeof schema.decantations.$inferSelect; businessDate: string }>,
  ): Promise<Decantation[]> {
    if (headers.length === 0) return [];
    const ids = headers.map((h) => h.d.id);
    const lineRows = await this.db
      .select()
      .from(schema.decantationTankLines)
      .where(inArray(schema.decantationTankLines.decantationId, ids))
      .orderBy(asc(schema.decantationTankLines.createdAt), asc(schema.decantationTankLines.id));
    const chamberRows = await this.db
      .select()
      .from(schema.decantationChambers)
      .where(inArray(schema.decantationChambers.decantationId, ids))
      .orderBy(asc(schema.decantationChambers.chamberNo));
    return headers.map(({ d, businessDate }) => ({
      id: d.id,
      organizationId: d.organizationId,
      stationId: d.stationId,
      businessDayId: d.businessDayId,
      businessDate,
      documentNumber: d.documentNumber,
      tankerNumber: d.tankerNumber,
      driverName: d.driverName,
      unloadStartedAt: isoOrNull(d.unloadStartedAt),
      unloadEndedAt: isoOrNull(d.unloadEndedAt),
      chambersChecked: d.chambersChecked,
      status: d.status as DecantationStatus,
      flags: (d.flags ?? []) as DecantationFlag[],
      notes: d.notes,
      recordedBy: d.recordedBy,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      lines: lineRows
        .filter((l) => l.decantationId === d.id)
        .map((l) => ({
          id: l.id,
          decantationId: l.decantationId,
          tankId: l.tankId,
          productId: l.productId,
          beforeDip: Number(l.beforeDip),
          beforeDipAt: isoOrNull(l.beforeDipAt),
          observedDensity: num(l.observedDensity),
          observedTempC: num(l.observedTempC),
          roDensity: num(l.roDensity),
          afterDip: num(l.afterDip),
          afterDipAt: isoOrNull(l.afterDipAt),
          salesDuring: Number(l.salesDuring),
          receivedQty: num(l.receivedQty),
          measuredBy: l.measuredBy as DecantationTankLine['measuredBy'],
          measurementRefId: l.measurementRefId,
          measuredAt: isoOrNull(l.measuredAt),
          status: l.status as DecantationTankLine['status'],
        })),
      chambers: chamberRows
        .filter((c) => c.decantationId === d.id)
        .map((c) => ({
          id: c.id,
          decantationId: c.decantationId,
          tankLineId: c.tankLineId,
          chamberNo: c.chamberNo,
          capacityL: num(c.capacityL),
          sealOk: c.sealOk,
          mark: c.mark as DecantationChamber['mark'],
          dipMm: num(c.dipMm),
          emptied: c.emptied,
        })),
    }));
  }

  async findById(organizationId: string, id: string): Promise<Decantation | null> {
    const rows = await this.db
      .select({ d: schema.decantations, businessDate: schema.businessDays.businessDate })
      .from(schema.decantations)
      .innerJoin(schema.businessDays, eq(schema.businessDays.id, schema.decantations.businessDayId))
      .where(
        and(eq(schema.decantations.id, id), eq(schema.decantations.organizationId, organizationId)),
      )
      .limit(1);
    return (await this.hydrate(rows))[0] ?? null;
  }

  async findPendingForTank(
    organizationId: string,
    stationId: string,
    tankId: string,
  ): Promise<Decantation[]> {
    const ids = await this.db
      .selectDistinct({ id: schema.decantationTankLines.decantationId })
      .from(schema.decantationTankLines)
      .innerJoin(
        schema.decantations,
        eq(schema.decantations.id, schema.decantationTankLines.decantationId),
      )
      .where(
        and(
          eq(schema.decantationTankLines.organizationId, organizationId),
          eq(schema.decantationTankLines.stationId, stationId),
          eq(schema.decantationTankLines.tankId, tankId),
          eq(schema.decantationTankLines.status, 'PENDING_MEASUREMENT'),
          sql`${schema.decantations.status} <> 'DRAFT'`,
        ),
      );
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ d: schema.decantations, businessDate: schema.businessDays.businessDate })
      .from(schema.decantations)
      .innerJoin(schema.businessDays, eq(schema.businessDays.id, schema.decantations.businessDayId))
      .where(
        and(
          eq(schema.decantations.organizationId, organizationId),
          inArray(
            schema.decantations.id,
            ids.map((i) => i.id),
          ),
        ),
      )
      .orderBy(asc(schema.decantations.createdAt));
    return this.hydrate(rows);
  }

  async updateMeasurement(d: Decantation): Promise<void> {
    await this.db
      .update(schema.decantations)
      .set({ status: d.status, flags: d.flags, updatedAt: new Date(d.updatedAt) })
      .where(
        and(
          eq(schema.decantations.id, d.id),
          eq(schema.decantations.organizationId, d.organizationId),
        ),
      );
    for (const l of d.lines) {
      await this.db
        .update(schema.decantationTankLines)
        .set({
          afterDip: str(l.afterDip),
          afterDipAt: dateOrNull(l.afterDipAt),
          salesDuring: String(l.salesDuring),
          receivedQty: str(l.receivedQty),
          measuredBy: l.measuredBy,
          measurementRefId: l.measurementRefId,
          measuredAt: dateOrNull(l.measuredAt),
          status: l.status,
        })
        .where(
          and(
            eq(schema.decantationTankLines.id, l.id),
            eq(schema.decantationTankLines.organizationId, d.organizationId),
          ),
        );
    }
  }

  async list(q: DecantationListQuery): Promise<Decantation[]> {
    const conds = [
      eq(schema.decantations.organizationId, q.organizationId),
      eq(schema.decantations.stationId, q.stationId),
    ];
    if (q.from) conds.push(gte(schema.businessDays.businessDate, q.from));
    if (q.to) conds.push(lte(schema.businessDays.businessDate, q.to));
    if (q.status) conds.push(eq(schema.decantations.status, q.status));
    const rows = await this.db
      .select({ d: schema.decantations, businessDate: schema.businessDays.businessDate })
      .from(schema.decantations)
      .innerJoin(schema.businessDays, eq(schema.businessDays.id, schema.decantations.businessDayId))
      .where(and(...conds))
      .orderBy(desc(schema.businessDays.businessDate), desc(schema.decantations.createdAt))
      .limit(q.limit ?? 200);
    return this.hydrate(rows);
  }
}

export class DrizzleDensityReadingRepository implements DensityReadingRepository {
  constructor(private readonly db: DbExecutor) {}

  private mapRow(
    row: typeof schema.densityReadings.$inferSelect,
    extra?: {
      productName?: string;
      productCode?: string;
      tankName?: string | null;
      nozzleName?: string | null;
      recordedByName?: string | null;
    },
  ): DensityReadingWithContext {
    return {
      id: row.id,
      organizationId: row.organizationId,
      stationId: row.stationId,
      businessDate: row.businessDate,
      productId: row.productId,
      kind: row.kind as 'MORNING' | 'ADHOC' | 'DECANTATION',
      sampledFrom: (row.sampledFrom as 'NOZZLE' | 'TANK' | null) ?? null,
      tankId: row.tankId,
      nozzleId: row.nozzleId,
      entryMethod: row.entryMethod as 'HYDROMETER' | 'DIRECT_15',
      observedDensity: num(row.observedDensity),
      observedTempC: num(row.observedTempC),
      density15: Number(row.density15),
      decantationTankLineId: row.decantationTankLineId,
      flags: (row.flags as unknown[]) ?? [],
      recordedBy: row.recordedBy,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt ? row.createdAt.toISOString() : undefined,
      productName: extra?.productName,
      productCode: extra?.productCode,
      tankName: extra?.tankName ?? null,
      nozzleName: extra?.nozzleName ?? null,
      recordedByName: extra?.recordedByName ?? null,
    };
  }

  async saveMany(readings: DensityReading[]): Promise<void> {
    if (readings.length === 0) return;
    await this.db.insert(schema.densityReadings).values(
      readings.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        stationId: r.stationId,
        businessDate: r.businessDate,
        productId: r.productId,
        kind: r.kind,
        sampledFrom: r.sampledFrom,
        tankId: r.tankId,
        nozzleId: r.nozzleId,
        entryMethod: r.entryMethod,
        observedDensity: str(r.observedDensity),
        observedTempC: str(r.observedTempC),
        density15: String(r.density15),
        decantationTankLineId: r.decantationTankLineId,
        flags: r.flags,
        recordedBy: r.recordedBy,
        recordedAt: new Date(r.recordedAt),
      })),
    );
  }

  async findLatestForProduct(
    organizationId: string,
    stationId: string,
    productId: string,
    beforeRecordedAt?: string,
  ): Promise<DensityReading | null> {
    const conditions = [
      eq(schema.densityReadings.organizationId, organizationId),
      eq(schema.densityReadings.stationId, stationId),
      eq(schema.densityReadings.productId, productId),
    ];
    if (beforeRecordedAt) {
      conditions.push(lt(schema.densityReadings.recordedAt, new Date(beforeRecordedAt)));
    }
    const [row] = await this.db
      .select()
      .from(schema.densityReadings)
      .where(and(...conditions))
      .orderBy(desc(schema.densityReadings.recordedAt), desc(schema.densityReadings.createdAt))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async hasInterveningDecantation(
    organizationId: string,
    stationId: string,
    productId: string,
    afterTimestamp: string,
    beforeTimestamp: string,
  ): Promise<boolean> {
    const after = new Date(afterTimestamp);
    const before = new Date(beforeTimestamp);

    // Check density_readings with kind = DECANTATION
    const [reading] = await this.db
      .select({ id: schema.densityReadings.id })
      .from(schema.densityReadings)
      .where(
        and(
          eq(schema.densityReadings.organizationId, organizationId),
          eq(schema.densityReadings.stationId, stationId),
          eq(schema.densityReadings.productId, productId),
          eq(schema.densityReadings.kind, 'DECANTATION'),
          gt(schema.densityReadings.recordedAt, after),
          lt(schema.densityReadings.recordedAt, before),
        ),
      )
      .limit(1);

    if (reading) return true;

    // Check decantations and decantation_tank_lines directly
    const [line] = await this.db
      .select({ id: schema.decantationTankLines.id })
      .from(schema.decantationTankLines)
      .innerJoin(
        schema.decantations,
        eq(schema.decantationTankLines.decantationId, schema.decantations.id),
      )
      .where(
        and(
          eq(schema.decantations.organizationId, organizationId),
          eq(schema.decantations.stationId, stationId),
          eq(schema.decantationTankLines.productId, productId),
          gt(schema.decantations.createdAt, after),
          lt(schema.decantations.createdAt, before),
        ),
      )
      .limit(1);

    return !!line;
  }

  async list(query: DensityReadingListQuery): Promise<DensityReadingWithContext[]> {
    const conditions = [
      eq(schema.densityReadings.organizationId, query.organizationId),
      eq(schema.densityReadings.stationId, query.stationId),
    ];
    if (query.productId) {
      conditions.push(eq(schema.densityReadings.productId, query.productId));
    }
    if (query.from) {
      conditions.push(gte(schema.densityReadings.businessDate, query.from));
    }
    if (query.to) {
      conditions.push(lte(schema.densityReadings.businessDate, query.to));
    }
    if (query.kind) {
      conditions.push(eq(schema.densityReadings.kind, query.kind));
    }

    const rows = await this.db
      .select({
        reading: schema.densityReadings,
        productName: schema.products.name,
        productCode: schema.products.code,
        tankName: schema.tanks.name,
        nozzleName: schema.nozzles.name,
        recordedByName: schema.users.fullName,
      })
      .from(schema.densityReadings)
      .leftJoin(schema.products, eq(schema.densityReadings.productId, schema.products.id))
      .leftJoin(schema.tanks, eq(schema.densityReadings.tankId, schema.tanks.id))
      .leftJoin(schema.nozzles, eq(schema.densityReadings.nozzleId, schema.nozzles.id))
      .leftJoin(schema.users, eq(schema.densityReadings.recordedBy, schema.users.id))
      .where(and(...conditions))
      .orderBy(
        desc(schema.densityReadings.businessDate),
        desc(schema.densityReadings.recordedAt),
        desc(schema.densityReadings.createdAt),
      )
      .limit(query.limit ?? 500);

    const items = rows.map((r) =>
      this.mapRow(r.reading, {
        productName: r.productName ?? undefined,
        productCode: r.productCode ?? undefined,
        tankName: r.tankName,
        nozzleName: r.nozzleName,
        recordedByName: r.recordedByName,
      }),
    );

    // Compute delta vs previous reading of that product
    const byProduct = new Map<string, DensityReadingWithContext[]>();
    for (const item of items) {
      if (!byProduct.has(item.productId)) {
        byProduct.set(item.productId, []);
      }
      byProduct.get(item.productId)!.push(item);
    }

    for (const prodItems of byProduct.values()) {
      const ascItems = [...prodItems].reverse();
      for (let i = 0; i < ascItems.length; i++) {
        if (i === 0) {
          ascItems[i].delta = null;
        } else {
          ascItems[i].delta = roundDensity(
            ascItems[i].density15 - ascItems[i - 1].density15,
            2,
          );
        }
      }
    }

    return items;
  }

  async getTodaySummary(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<DensityTodaySummary> {
    // 1. Get fuel products for this station (from tanks or products)
    const tankProducts = await this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        productCode: schema.products.code,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(
        and(
          eq(schema.tanks.organizationId, organizationId),
          eq(schema.tanks.stationId, stationId),
          eq(schema.tanks.status, 'ACTIVE'),
        ),
      );

    const uniqueProducts = new Map<string, { id: string; name: string; code: string }>();
    for (const tp of tankProducts) {
      if (!uniqueProducts.has(tp.productId)) {
        uniqueProducts.set(tp.productId, {
          id: tp.productId,
          name: tp.productName,
          code: tp.productCode,
        });
      }
    }

    if (uniqueProducts.size === 0) {
      const allFuel = await this.db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          code: schema.products.code,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.organizationId, organizationId),
            eq(schema.products.productType, 'FUEL'),
          ),
        );
      for (const p of allFuel) {
        uniqueProducts.set(p.id, p);
      }
    }

    // 2. Compute 14-day date window
    const dates14: string[] = [];
    for (let i = 13; i >= 0; i--) {
      dates14.push(shiftBusinessDate(businessDate, -i));
    }
    const windowStart = dates14[0];

    // 3. Fetch readings in date window
    const windowReadings = await this.list({
      organizationId,
      stationId,
      from: windowStart,
      to: businessDate,
      limit: 1000,
    });

    const byProd = new Map<string, DensityReadingWithContext[]>();
    for (const r of windowReadings) {
      if (!byProd.has(r.productId)) {
        byProd.set(r.productId, []);
      }
      byProd.get(r.productId)!.push(r);
    }

    // 4. Build product summaries
    const productSummaries: DensityTodayProductSummary[] = [];
    let recordedCount = 0;

    for (const prod of uniqueProducts.values()) {
      const prodReadings = byProd.get(prod.id) ?? [];
      const todayReadings = prodReadings.filter((r) => r.businessDate === businessDate);
      const latestToday = todayReadings.length > 0 ? todayReadings[0] : null;
      const todayRecorded = latestToday != null;
      if (todayRecorded) recordedCount++;

      const trend14d = dates14.map((d) => {
        const onDate = prodReadings.filter((r) => r.businessDate === d);
        return {
          date: d,
          density15: onDate.length > 0 ? onDate[0].density15 : null,
        };
      });

      const lastReadings = prodReadings.slice(0, 4);

      productSummaries.push({
        productId: prod.id,
        productName: prod.name,
        productCode: prod.code,
        latestToday,
        todayRecorded,
        trend14d,
        lastReadings,
      });
    }

    const totalProducts = uniqueProducts.size;
    const missingCount = Math.max(0, totalProducts - recordedCount);

    return {
      businessDate,
      products: productSummaries,
      recordedCount,
      missingCount,
      totalProducts,
    };
  }
}

export class DrizzleDecantationPurchaseRepository implements DecantationPurchaseRepository {
  constructor(private readonly db: DbExecutor) {}

  private toLink(r: typeof schema.decantationPurchases.$inferSelect): DecantationPurchaseLink {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      decantationId: r.decantationId,
      purchaseId: r.purchaseId,
      productId: r.productId,
      receivedQty: num(r.receivedQty),
      invoiceQty: num(r.invoiceQty),
      varianceQty: num(r.varianceQty),
      varianceComputedAt: isoOrNull(r.varianceComputedAt),
    };
  }

  async listForPurchaseProduct(organizationId: string, purchaseId: string, productId: string) {
    const rows = await this.db
      .select()
      .from(schema.decantationPurchases)
      .where(
        and(
          eq(schema.decantationPurchases.organizationId, organizationId),
          eq(schema.decantationPurchases.purchaseId, purchaseId),
          eq(schema.decantationPurchases.productId, productId),
        ),
      );
    return rows.map((r) => this.toLink(r));
  }

  async listForDecantation(organizationId: string, decantationId: string) {
    const rows = await this.db
      .select()
      .from(schema.decantationPurchases)
      .where(
        and(
          eq(schema.decantationPurchases.organizationId, organizationId),
          eq(schema.decantationPurchases.decantationId, decantationId),
        ),
      );
    return rows.map((r) => this.toLink(r));
  }

  async updateVariance(l: DecantationPurchaseLink): Promise<void> {
    await this.db
      .update(schema.decantationPurchases)
      .set({
        receivedQty: str(l.receivedQty),
        invoiceQty: str(l.invoiceQty),
        varianceQty: str(l.varianceQty),
        varianceComputedAt: dateOrNull(l.varianceComputedAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.decantationPurchases.id, l.id),
          eq(schema.decantationPurchases.organizationId, l.organizationId),
        ),
      );
  }

  async invoiceLine(organizationId: string, purchaseId: string, productId: string) {
    const rows = (await this.db.execute(sql`
      SELECT COALESCE(SUM(pi.quantity), 0) AS quantity,
        COALESCE(SUM(pi.quantity * pi.unit_price), 0) AS value,
        COUNT(*)::int AS n
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE p.organization_id = ${organizationId}
        AND pi.purchase_id = ${purchaseId} AND pi.product_id = ${productId}
    `)) as unknown as { quantity: string; value: string; n: number }[];
    const r = rows[0];
    return r && r.n > 0 ? { quantity: Number(r.quantity), value: Number(r.value) } : null;
  }
}

export class DrizzleTankSalesReader implements TankSalesReader {
  constructor(private readonly db: DbExecutor) {}

  async litresSoldBetween(tankId: string, fromIso: string, toIso: string): Promise<number> {
    const rows = (await this.db.execute(sql`
      SELECT COALESCE(-SUM(quantity), 0) AS sold
      FROM stock_movements
      WHERE tank_id = ${tankId} AND movement_type = 'Sale'
        AND created_at > ${fromIso}::timestamp AND created_at <= ${toIso}::timestamp
    `)) as unknown as { sold: string }[];
    return Number(rows[0]?.sold ?? 0);
  }
}

/** Wires the #468 measurement service to a transaction. */
export function createDecantationMeasurement(
  tx: DbExecutor,
  events: EventPublisher,
): DecantationMeasurementService {
  return new DecantationMeasurementService({
    decantations: new DrizzleDecantationRepository(tx),
    links: new DrizzleDecantationPurchaseRepository(tx),
    movements: new DrizzleStockMovementRepository(tx),
    products: new DrizzleProductRepository(tx),
    sales: new DrizzleTankSalesReader(tx),
    events,
  });
}
