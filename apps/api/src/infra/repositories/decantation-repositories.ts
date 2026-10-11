import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { schema, type DbExecutor } from '@pump/db';
import type {
  Decantation,
  DecantationChamber,
  DecantationFlag,
  DecantationListQuery,
  DecantationRepository,
  DecantationStatus,
  DecantationTankLine,
  DensityReading,
  DensityReadingRepository,
} from '@pump/core';

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
}
