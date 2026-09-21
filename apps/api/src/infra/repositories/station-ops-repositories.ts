import { and, eq, inArray, desc, ne, or, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  BusinessDay,
  BusinessDayRepository,
  BusinessDayLock,
  BusinessDayStatusReader,
  BusinessDayStatusSlices,
  BusinessDayStatusItem,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
  NozzleReading,
  NozzleReadingRepository,
  NozzleClosingUpdate,
  ShiftReconciliationReader,
  ShiftReconciliationTotals,
  CreditSalesReader,
  CreditSaleRecord,
  StockMovementInput,
  StockMovementWriter,
  ShiftSummaryStore,
  AcceptedHandoverReading,
  AttendantHandover,
  HandoverContext,
  HandoverContextReader,
  HandoverRepository,
  HandoverTerminalEntry,
  CloseShiftContext,
  CloseShiftContextReader,
} from '@pump/core';
import { rowJson } from '../sql-json.js';

export class DrizzleBusinessDayStatusReader implements BusinessDayStatusReader {
  constructor(private readonly db: DbClient) {}

  private projection() {
    return {
      id: schema.businessDays.id,
      businessDate: schema.businessDays.businessDate,
      status: schema.businessDays.status,
      openedAt: schema.businessDays.openedAt,
      closedAt: schema.businessDays.closedAt,
      // The correlation MUST be qualified as business_days.id: Drizzle renders
      // a bare column reference unqualified inside a raw sql`` fragment, so an
      // unqualified `id` resolves to the subquery's own `s.id` / `e.id` scope —
      // `s.business_day_id = s.id` is never true (#225).
      openShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = business_days.id AND s.status = 'OPEN')`,
      closedShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = business_days.id AND s.status IN ('CLOSED', 'LOCKED'))`,
      // Rendered as ISO-8601 UTC in SQL: the raw fragment bypasses Drizzle's
      // column mapper, and postgres-js would hand back a zone-less string that
      // `new Date()` mis-parses as local time.
      lastActivityAt: sql<string>`to_char(GREATEST(
        ${schema.businessDays.updatedAt},
        COALESCE((SELECT MAX(s.updated_at) FROM shifts s WHERE s.business_day_id = business_days.id), ${schema.businessDays.updatedAt}),
        COALESCE((SELECT MAX(e.occurred_at) FROM events e WHERE e.business_day_id = business_days.id), ${schema.businessDays.updatedAt})
      ), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    };
  }

  private toItem(row: any): BusinessDayStatusItem {
    // Raw SQL fragments (e.g. the GREATEST(...) lastActivityAt) bypass Drizzle's
    // column mappers and arrive as strings from postgres-js, so normalize both.
    const toIso = (v: Date | string | null | undefined): string | null =>
      v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
    return {
      ...row,
      status: row.status as BusinessDayStatusItem['status'],
      openedAt: toIso(row.openedAt)!,
      closedAt: toIso(row.closedAt),
      openShiftCount: Number(row.openShiftCount),
      closedShiftCount: Number(row.closedShiftCount),
      lastActivityAt: toIso(row.lastActivityAt)!,
    };
  }

  async loadSlices(
    organizationId: string,
    stationId: string,
    requestedBusinessDate: string,
    currentBusinessDate: string,
  ): Promise<BusinessDayStatusSlices> {
    // ONE query for all three slices (#155): the requested date's day plus
    // every OPEN day. `pastOpen` is a pure subset of `open`, and `requested`
    // is a lookup by date, so classification happens here, not in SQL.
    const rows = await this.db
      .select(this.projection())
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          or(
            eq(schema.businessDays.businessDate, requestedBusinessDate),
            eq(schema.businessDays.status, 'OPEN'),
          ),
        ),
      )
      .orderBy(desc(schema.businessDays.businessDate));
    const items = rows.map((row) => this.toItem(row));
    const open = items.filter((i) => i.status === 'OPEN');
    return {
      requested: items.find((i) => i.businessDate === requestedBusinessDate) ?? null,
      open,
      pastOpen: open.filter((i) => i.businessDate < currentBusinessDate),
    };
  }
}

export class DrizzleBusinessDayRepository implements BusinessDayRepository, BusinessDayLock {
  constructor(private readonly db: DbClient) {}

  private toEntity(r: typeof schema.businessDays.$inferSelect): BusinessDay {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      businessDate: r.businessDate,
      status: r.status as BusinessDay['status'],
      openedBy: r.openedBy,
      openedAt: r.openedAt.toISOString(),
      closedBy: r.closedBy,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async findById(id: string): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(eq(schema.businessDays.id, id))
      .limit(1);
    return r ? this.toEntity(r) : null;
  }

  async lockById(organizationId: string, businessDayId: string): Promise<void> {
    await this.db
      .select({ id: schema.businessDays.id })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.id, businessDayId),
          eq(schema.businessDays.organizationId, organizationId),
        ),
      )
      .for('update');
  }

  async lockStation(organizationId: string, stationId: string): Promise<void> {
    await this.db
      .select({ id: schema.stations.id })
      .from(schema.stations)
      .where(
        and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, organizationId)),
      )
      .for('update');
  }

  async lockByStationAndDate(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<void> {
    await this.db
      .select({ id: schema.businessDays.id })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.businessDate, businessDate),
        ),
      )
      .for('update');
  }

  async save(d: BusinessDay): Promise<void> {
    await this.db
      .insert(schema.businessDays)
      .values({
        id: d.id,
        organizationId: d.organizationId,
        stationId: d.stationId,
        businessDate: d.businessDate,
        status: d.status,
        openedBy: d.openedBy,
        openedAt: new Date(d.openedAt),
        closedBy: d.closedBy,
        closedAt: d.closedAt ? new Date(d.closedAt) : null,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.businessDays.id,
        set: {
          status: d.status,
          closedBy: d.closedBy,
          closedAt: d.closedAt ? new Date(d.closedAt) : null,
          updatedAt: new Date(d.updatedAt),
        },
      });
  }

  async findOpenByStation(organizationId: string, stationId: string): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.status, 'OPEN'),
        ),
      )
      .orderBy(desc(schema.businessDays.businessDate))
      .limit(1);
    return r ? this.toEntity(r) : null;
  }

  async findByStationAndDate(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.businessDate, businessDate),
        ),
      )
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
}

// ---------------- Shifts ----------------
export class DrizzleShiftRepository implements ShiftRepository {
  constructor(private readonly db: DbClient) {}
  async hasOpenShift(businessDayId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.shifts.id })
      .from(schema.shifts)
      .where(and(eq(schema.shifts.businessDayId, businessDayId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);
    return Boolean(row);
  }
  private toEntity(r: typeof schema.shifts.$inferSelect): Shift {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      businessDayId: r.businessDayId,
      shiftTemplateId: r.shiftTemplateId,
      status: r.status as Shift['status'],
      openedBy: r.openedBy,
      openedAt: r.openedAt.toISOString(),
      closedBy: r.closedBy,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
      openingCash: r.openingCash,
      closingCash: r.closingCash,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Shift | null> {
    const [r] = await this.db
      .select()
      .from(schema.shifts)
      .where(eq(schema.shifts.id, id))
      .limit(1)
      .for('update');
    return r ? this.toEntity(r) : null;
  }
  async findByIdWithoutLock(id: string): Promise<Shift | null> {
    const [r] = await this.db.select().from(schema.shifts).where(eq(schema.shifts.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(s: Shift): Promise<void> {
    await this.db
      .insert(schema.shifts)
      .values({
        id: s.id,
        organizationId: s.organizationId,
        stationId: s.stationId,
        businessDayId: s.businessDayId,
        shiftTemplateId: s.shiftTemplateId,
        status: s.status,
        openedBy: s.openedBy,
        openedAt: new Date(s.openedAt),
        closedBy: s.closedBy,
        closedAt: s.closedAt ? new Date(s.closedAt) : null,
        lockedAt: s.lockedAt ? new Date(s.lockedAt) : null,
        openingCash: s.openingCash,
        closingCash: s.closingCash,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.shifts.id,
        set: {
          status: s.status,
          closedBy: s.closedBy,
          closedAt: s.closedAt ? new Date(s.closedAt) : null,
          lockedAt: s.lockedAt ? new Date(s.lockedAt) : null,
          closingCash: s.closingCash,
          updatedAt: new Date(s.updatedAt),
        },
      });
  }
  async findOpenByStation(organizationId: string, stationId: string): Promise<Shift | null> {
    const [r] = await this.db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.status, 'OPEN'),
        ),
      )
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
  async addStaffAssignments(shiftId: string, assignments: StaffAssignmentInput[]): Promise<void> {
    if (assignments.length === 0) return;
    await this.db
      .insert(schema.shiftStaffAssignments)
      .values(assignments.map((a) => ({ shiftId, userId: a.userId, duId: a.duId })));
  }
  async addTerminalLinks(shiftId: string, links: TerminalLinkInput[]): Promise<void> {
    if (links.length === 0) return;
    await this.db
      .insert(schema.shiftTerminalLinks)
      .values(links.map((l) => ({ shiftId, terminalId: l.terminalId, duId: l.duId ?? null })));
  }
}

// ---------------- Nozzle Readings ----------------
export class DrizzleNozzleReadingRepository implements NozzleReadingRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.nozzleReadings.$inferSelect): NozzleReading {
    return {
      id: r.id,
      shiftId: r.shiftId,
      nozzleId: r.nozzleId,
      openingReading: r.openingReading,
      closingReading: r.closingReading,
      volumeSold: r.volumeSold,
      testingVolume: r.testingVolume,
      unitPrice: r.unitPrice,
      createdAt: r.createdAt.toISOString(),
    };
  }
  async lastClosingByNozzleIds(nozzleIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (nozzleIds.length === 0) return m;
    const rows = await this.db
      .select()
      .from(schema.nozzleReadings)
      .where(inArray(schema.nozzleReadings.nozzleId, nozzleIds))
      .orderBy(desc(schema.nozzleReadings.createdAt));
    for (const r of rows) {
      if (!m.has(r.nozzleId)) m.set(r.nozzleId, Number(r.closingReading));
    }
    return m;
  }
  async saveMany(readings: NozzleReading[]): Promise<void> {
    if (readings.length === 0) return;
    await this.db.insert(schema.nozzleReadings).values(
      readings.map((r) => ({
        id: r.id,
        shiftId: r.shiftId,
        nozzleId: r.nozzleId,
        openingReading: r.openingReading,
        closingReading: r.closingReading,
        volumeSold: r.volumeSold,
        testingVolume: r.testingVolume,
        unitPrice: r.unitPrice,
        createdAt: new Date(r.createdAt),
      })),
    );
  }
  async listByShift(shiftId: string): Promise<NozzleReading[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzleReadings)
      .where(eq(schema.nozzleReadings.shiftId, shiftId));
    return rows.map((r) => this.toEntity(r));
  }
  async updateClosingMany(updates: NozzleClosingUpdate[]): Promise<void> {
    await updateReadingColumns(
      this.db,
      updates.map((u) => ({
        id: u.id,
        closingReading: u.closingReading,
        volumeSold: u.volumeSold,
      })),
    );
  }
}

/**
 * Batched nozzle-reading update: ONE `UPDATE … FROM (VALUES …)` statement for
 * any number of nozzles (#229/#231) — the per-row loop cost a round-trip per
 * nozzle inside money-path transactions. testingVolume is only written when
 * provided (handover path), preserving the stored value otherwise.
 */
async function updateReadingColumns(
  db: DbClient,
  rows: { id: string; closingReading: string; volumeSold: string; testingVolume?: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const withTesting = rows.some((r) => r.testingVolume !== undefined);
  const values = sql.join(
    rows.map((r) =>
      withTesting
        ? sql`(${r.id}::uuid, ${r.closingReading}::numeric, ${r.volumeSold}::numeric, ${r.testingVolume ?? null}::numeric)`
        : sql`(${r.id}::uuid, ${r.closingReading}::numeric, ${r.volumeSold}::numeric)`,
    ),
    sql`, `,
  );
  if (withTesting) {
    await db.execute(sql`
      UPDATE nozzle_readings nr SET
        closing_reading = v.closing_reading,
        volume_sold = v.volume_sold,
        testing_volume = COALESCE(v.testing_volume, nr.testing_volume)
      FROM (VALUES ${values}) AS v(id, closing_reading, volume_sold, testing_volume)
      WHERE nr.id = v.id
    `);
  } else {
    await db.execute(sql`
      UPDATE nozzle_readings nr SET
        closing_reading = v.closing_reading,
        volume_sold = v.volume_sold
      FROM (VALUES ${values}) AS v(id, closing_reading, volume_sold)
      WHERE nr.id = v.id
    `);
  }
}

// ---------------- Attendant Handover ----------------
export class DrizzleHandoverContextReader implements HandoverContextReader {
  constructor(private readonly db: DbClient) {}

  async load(
    organizationId: string,
    stationId: string,
    shiftId: string,
    attendantId: string,
    duId: string,
  ): Promise<HandoverContext> {
    const [
      attendantRows,
      dispenserRows,
      assignmentRows,
      readingRows,
      terminalRows,
      creditRows,
      omcRows,
      merchandiseRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(schema.users)
        .where(
          and(eq(schema.users.id, attendantId), eq(schema.users.organizationId, organizationId)),
        )
        .limit(1),
      this.db
        .select()
        .from(schema.dispenserUnits)
        .where(
          and(
            eq(schema.dispenserUnits.id, duId),
            eq(schema.dispenserUnits.organizationId, organizationId),
            eq(schema.dispenserUnits.stationId, stationId),
          ),
        )
        .limit(1),
      this.db
        .select({ id: schema.shiftStaffAssignments.id })
        .from(schema.shiftStaffAssignments)
        .innerJoin(
          schema.shifts,
          and(
            eq(schema.shifts.id, schema.shiftStaffAssignments.shiftId),
            eq(schema.shifts.organizationId, organizationId),
            eq(schema.shifts.stationId, stationId),
          ),
        )
        .where(
          and(
            eq(schema.shiftStaffAssignments.shiftId, shiftId),
            eq(schema.shiftStaffAssignments.userId, attendantId),
            eq(schema.shiftStaffAssignments.duId, duId),
          ),
        )
        .limit(1),
      this.db
        .select({ reading: schema.nozzleReadings, nozzle: schema.nozzles })
        .from(schema.nozzles)
        .leftJoin(
          schema.nozzleReadings,
          and(
            eq(schema.nozzleReadings.nozzleId, schema.nozzles.id),
            eq(schema.nozzleReadings.shiftId, shiftId),
          ),
        )
        .where(
          and(
            eq(schema.nozzles.organizationId, organizationId),
            eq(schema.nozzles.stationId, stationId),
            eq(schema.nozzles.duId, duId),
          ),
        ),
      this.db
        .select({ terminal: schema.paymentTerminals, linkedDuId: schema.shiftTerminalLinks.duId })
        .from(schema.paymentTerminals)
        .leftJoin(
          schema.shiftTerminalLinks,
          and(
            eq(schema.shiftTerminalLinks.terminalId, schema.paymentTerminals.id),
            eq(schema.shiftTerminalLinks.shiftId, shiftId),
          ),
        )
        .where(
          and(
            eq(schema.paymentTerminals.organizationId, organizationId),
            eq(schema.paymentTerminals.stationId, stationId),
            eq(schema.paymentTerminals.isActive, true),
          ),
        ),
      this.db
        .select({ amount: schema.customerTransactions.amount })
        .from(schema.customerTransactions)
        .innerJoin(
          schema.shifts,
          and(
            eq(schema.shifts.id, schema.customerTransactions.shiftId),
            eq(schema.shifts.organizationId, organizationId),
            eq(schema.shifts.stationId, stationId),
          ),
        )
        .where(
          and(
            eq(schema.customerTransactions.shiftId, shiftId),
            eq(schema.customerTransactions.attendantId, attendantId),
            eq(schema.customerTransactions.duId, duId),
            eq(schema.customerTransactions.transactionType, 'Credit Sale'),
            eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
          ),
        ),
      this.db
        .select({ amount: schema.customerTransactions.amount })
        .from(schema.customerTransactions)
        .innerJoin(
          schema.shifts,
          and(
            eq(schema.shifts.id, schema.customerTransactions.shiftId),
            eq(schema.shifts.organizationId, organizationId),
            eq(schema.shifts.stationId, stationId),
          ),
        )
        .where(
          and(
            eq(schema.customerTransactions.shiftId, shiftId),
            eq(schema.customerTransactions.attendantId, attendantId),
            eq(schema.customerTransactions.duId, duId),
            eq(schema.customerTransactions.transactionType, 'OMC Sale'),
            eq(schema.customerTransactions.referenceType, 'OMC_CARD_SALE'),
          ),
        ),
      this.db
        .select({ total: schema.sales.totalAmount, nonCash: schema.sales.nonCashAmount })
        .from(schema.sales)
        .innerJoin(
          schema.shifts,
          and(
            eq(schema.shifts.id, schema.sales.shiftId),
            eq(schema.shifts.organizationId, organizationId),
            eq(schema.shifts.stationId, stationId),
          ),
        )
        .where(
          and(
            eq(schema.sales.shiftId, shiftId),
            eq(schema.sales.attendantId, attendantId),
            ne(schema.sales.saleType, 'Fuel'),
            eq(schema.sales.paymentMethod, 'Cash'),
          ),
        ),
    ]);

    const attendant = attendantRows[0];
    const dispenser = dispenserRows[0];
    return {
      attendant: attendant
        ? {
            id: attendant.id,
            organizationId: attendant.organizationId,
            fullName: attendant.fullName,
            role: attendant.role,
            status: attendant.status,
          }
        : null,
      dispenser: dispenser
        ? {
            id: dispenser.id,
            organizationId: dispenser.organizationId,
            stationId: dispenser.stationId,
            name: dispenser.name,
            code: dispenser.code,
            status: dispenser.status,
          }
        : null,
      assigned: assignmentRows.length > 0,
      nozzleReadings: readingRows
        .filter((row) => row.reading !== null)
        .map(({ reading, nozzle }) => ({
          ...this.toHandoverReading(reading!),
          organizationId: nozzle.organizationId,
          stationId: nozzle.stationId,
          duId: nozzle.duId,
          nozzleName: nozzle.name,
        })),
      missingReadingNozzleIds: readingRows
        .filter((row) => row.reading === null)
        .map((row) => row.nozzle.id),
      terminals: terminalRows.map(({ terminal, linkedDuId }) => ({
        id: terminal.id,
        organizationId: terminal.organizationId,
        stationId: terminal.stationId,
        label: terminal.label,
        supportsCard: terminal.supportsCard,
        supportsUpi: terminal.supportsUpi,
        isActive: terminal.isActive,
        linkedDuId,
      })),
      creditSales: creditRows.reduce((sum, row) => sum + Number(row.amount), 0),
      omcCardSales: omcRows.reduce((sum, row) => sum + Number(row.amount), 0),
      merchandiseCash: merchandiseRows.reduce(
        (sum, row) => sum + Number(row.total) - Number(row.nonCash ?? 0),
        0,
      ),
    };
  }

  private toHandoverReading(r: typeof schema.nozzleReadings.$inferSelect) {
    return {
      id: r.id,
      shiftId: r.shiftId,
      nozzleId: r.nozzleId,
      openingReading: r.openingReading,
      closingReading: r.closingReading,
      volumeSold: r.volumeSold,
      testingVolume: r.testingVolume,
      unitPrice: r.unitPrice,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

export class DrizzleHandoverRepository implements HandoverRepository {
  constructor(private readonly db: DbClient) {}

  async replaceCurrent(handover: AttendantHandover, terminalEntries: HandoverTerminalEntry[]) {
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${handover.organizationId}:${handover.stationId}:${handover.shiftId}:${handover.attendantId}:${handover.duId}`}, 0))`,
    );
    const [existing] = await this.db
      .select({ id: schema.attendantHandovers.id })
      .from(schema.attendantHandovers)
      .where(
        and(
          eq(schema.attendantHandovers.organizationId, handover.organizationId),
          eq(schema.attendantHandovers.stationId, handover.stationId),
          eq(schema.attendantHandovers.shiftId, handover.shiftId),
          eq(schema.attendantHandovers.userId, handover.attendantId),
          eq(schema.attendantHandovers.duId, handover.duId),
        ),
      )
      .limit(1);
    const [row] = await this.db
      .insert(schema.attendantHandovers)
      .values({
        id: handover.id,
        organizationId: handover.organizationId,
        stationId: handover.stationId,
        shiftId: handover.shiftId,
        userId: handover.attendantId,
        duId: handover.duId,
        cashHandedOver: handover.cashHandedOver,
        cardHandedOver: handover.cardHandedOver,
        upiHandedOver: handover.upiHandedOver,
        creditHandedOver: handover.creditHandedOver,
        testingVolume: handover.testingVolume,
        expectedSales: handover.expectedSales,
        varianceAmount: handover.varianceAmount,
        createdAt: new Date(handover.createdAt),
      })
      .onConflictDoUpdate({
        target: [
          schema.attendantHandovers.organizationId,
          schema.attendantHandovers.stationId,
          schema.attendantHandovers.shiftId,
          schema.attendantHandovers.userId,
          schema.attendantHandovers.duId,
        ],
        set: {
          cashHandedOver: handover.cashHandedOver,
          cardHandedOver: handover.cardHandedOver,
          upiHandedOver: handover.upiHandedOver,
          creditHandedOver: handover.creditHandedOver,
          testingVolume: handover.testingVolume,
          expectedSales: handover.expectedSales,
          varianceAmount: handover.varianceAmount,
          createdAt: new Date(handover.createdAt),
        },
      })
      .returning();

    await this.db
      .delete(schema.handoverTerminalEntries)
      .where(eq(schema.handoverTerminalEntries.handoverId, row.id));
    const savedEntries =
      terminalEntries.length > 0
        ? await this.db
            .insert(schema.handoverTerminalEntries)
            .values(
              terminalEntries.map((entry) => ({
                id: entry.id,
                organizationId: handover.organizationId,
                stationId: handover.stationId,
                handoverId: row.id,
                shiftId: handover.shiftId,
                terminalId: entry.terminalId,
                duId: entry.duId,
                cardAmount: entry.cardAmount,
                upiAmount: entry.upiAmount,
                batchRef: entry.batchRef,
                createdAt: new Date(entry.createdAt),
              })),
            )
            .returning()
        : [];
    const saved: AttendantHandover = {
      id: row.id,
      organizationId: row.organizationId,
      stationId: row.stationId,
      shiftId: row.shiftId,
      attendantId: row.userId,
      duId: row.duId,
      cashHandedOver: row.cashHandedOver,
      cardHandedOver: row.cardHandedOver,
      upiHandedOver: row.upiHandedOver,
      creditHandedOver: row.creditHandedOver,
      testingVolume: row.testingVolume,
      expectedSales: row.expectedSales,
      varianceAmount: row.varianceAmount,
      createdAt: row.createdAt.toISOString(),
    };
    return {
      handover: saved,
      replaced: Boolean(existing),
      terminalEntries: savedEntries.map((entry) => ({
        id: entry.id,
        handoverId: entry.handoverId,
        terminalId: entry.terminalId,
        duId: entry.duId ?? handover.duId,
        cardAmount: entry.cardAmount,
        upiAmount: entry.upiAmount,
        batchRef: entry.batchRef,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async updateReadings(readings: AcceptedHandoverReading[]): Promise<void> {
    await updateReadingColumns(
      this.db,
      readings.map((r) => ({
        id: r.id,
        closingReading: String(r.closingReading),
        volumeSold: String(r.grossVolume),
        testingVolume: String(r.testingVolume),
      })),
    );
  }
}

// ---------------- Shift Reconciliation (drawer model) ----------------

/**
 * The whole drawer model as ONE jsonb expression (#229): each money source is a
 * scalar aggregate sub-select and the per-seller cash breakdown is a jsonb
 * array. Shared by the reconciliation reader and the consolidated close-shift
 * context read, so both paths always compute identical figures.
 */
export function reconTotalsJson(shiftId: string) {
  return sql`(SELECT jsonb_build_object(
    'cash_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Cash'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'card_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Card'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'upi_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'UPI'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'credit_collections', (SELECT COALESCE(SUM(amount) FILTER (WHERE payment_method = 'Credit'), 0)::float8
      FROM collections WHERE shift_id = ${shiftId}),
    'drawer_expenses', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE affects_drawer AND COALESCE(status, '') <> 'VOIDED'), 0)::float8
      FROM expenses WHERE shift_id = ${shiftId}),
    'cash_income', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE affects_drawer AND COALESCE(status, '') <> 'VOIDED'), 0)::float8
      FROM other_income WHERE shift_id = ${shiftId}),
    'drawer_supplier_payments', (SELECT COALESCE(SUM(amount) FILTER (
        WHERE transaction_type = 'Payment' AND affects_drawer), 0)::float8
      FROM supplier_transactions WHERE shift_id = ${shiftId}),
    'handover_cash', (SELECT COALESCE(SUM(cash_handed_over), 0)::float8
      FROM attendant_handovers WHERE shift_id = ${shiftId}),
    'handover_count', (SELECT COUNT(*)::int FROM attendant_handovers WHERE shift_id = ${shiftId}),
    -- Per-seller cash portion of cash-recorded sales (total − non-cash), with
    -- whether the seller has a DU handover this shift ("inside" sellers' cash
    -- is already declared in their handover cashHandedOver).
    'sellers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'attendantId', t.attendant_id,
        'fullName', t.full_name,
        'amount', t.amount,
        'inside', t.inside
      )) FROM (
        SELECT
          s.attendant_id,
          u.full_name,
          SUM(s.total_amount - COALESCE(s.non_cash_amount, 0))::float8 AS amount,
          (s.attendant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM attendant_handovers h
            WHERE h.shift_id = ${shiftId} AND h.user_id = s.attendant_id
          )) AS inside
        FROM sales s
        LEFT JOIN users u ON u.id = s.attendant_id
        WHERE s.shift_id = ${shiftId} AND s.payment_method = 'Cash'
        GROUP BY s.attendant_id, u.full_name
      ) t), '[]'::jsonb)
  ))`;
}

/** Assemble the port shape from the reconTotalsJson payload (shared JS math). */
export function assembleReconTotals(raw: Record<string, any>): ShiftReconciliationTotals {
  const sellers =
    (raw.sellers as Array<{
      attendantId: string | null;
      fullName: string | null;
      amount: number;
      inside: boolean;
    }>) ?? [];
  const handoverCount = Number(raw.handover_count ?? 0);
  const handoverCash = Number(raw.handover_cash ?? 0);

  // Cash sales for the drawer = the cash attendants declared in their DU handovers
  // (fuel cash is never a `sales` row — it's metered and declared at handover),
  // PLUS merchandise cash from sellers who have NO handover (office/counter staff),
  // whose cash isn't captured anywhere else. Attendants' own merch cash is already
  // inside their handover cashHandedOver. Fall back to all merch cash when there
  // are no handovers at all (legacy / handover-less shifts).
  const merchCashSales = sellers.reduce((acc, s) => acc + Number(s.amount), 0);
  const outsideRows = sellers.filter((s) => !s.inside);
  const nonHandoverMerchCash = outsideRows.reduce((acc, s) => acc + Number(s.amount), 0);

  // Per-seller breakdown of the non-attendant (outside-handover) merch cash,
  // computed from the SAME rows as the total so the two always reconcile.
  // Sales with no seller fall under "Counter / unassigned".
  const rowsForBreakdown = handoverCount > 0 ? outsideRows : sellers;
  const merchCashOutsideHandoverBreakdown = rowsForBreakdown
    .filter((s) => Number(s.amount) !== 0)
    .map((s) => ({
      sellerName: s.attendantId == null ? 'Counter / unassigned' : (s.fullName ?? 'Unknown'),
      amount: Number(s.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    cashSales: handoverCount > 0 ? handoverCash + nonHandoverMerchCash : merchCashSales,
    handoverCash: handoverCount > 0 ? handoverCash : 0,
    merchCashOutsideHandover: handoverCount > 0 ? nonHandoverMerchCash : merchCashSales,
    merchCashOutsideHandoverBreakdown,
    cashCollections: Number(raw.cash_collections ?? 0),
    cardCollections: Number(raw.card_collections ?? 0),
    upiCollections: Number(raw.upi_collections ?? 0),
    creditCollections: Number(raw.credit_collections ?? 0),
    cashIncome: Number(raw.cash_income ?? 0),
    drawerExpenses: Number(raw.drawer_expenses ?? 0),
    drawerSupplierPayments: Number(raw.drawer_supplier_payments ?? 0),
  };
}

export class DrizzleShiftReconciliationReader implements ShiftReconciliationReader {
  constructor(private readonly db: DbClient) {}
  async totalsForShift(shiftId: string): Promise<ShiftReconciliationTotals> {
    const [row] = (await this.db.execute(
      sql`SELECT ${reconTotalsJson(shiftId)} AS recon`,
    )) as unknown as [Record<string, any>];
    return assembleReconTotals(row.recon ?? {});
  }
}

/** The credit-sale row shape used by close-shift snapshots and the reader. */
const CREDIT_SALE_JSON = (shiftId: string) => sql`
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id,
      'amount', ct.amount::float8,
      'quantity', ct.quantity::float8,
      'unitPrice', ct.unit_price::float8,
      'notes', ct.notes,
      'duId', ct.du_id,
      'attendantId', ct.attendant_id,
      'customerId', COALESCE(ct.customer_id::text, ''),
      'vehicleId', ct.vehicle_id,
      'productId', ct.product_id,
      'customerName', COALESCE(cust.name, 'Customer'),
      'productName', prod.name,
      'productCode', prod.code,
      'vehicleNumber', cv.registration_number
    ) ORDER BY ct.created_at, ct.id)
    FROM customer_transactions ct
    LEFT JOIN customers cust ON cust.id = ct.customer_id
    LEFT JOIN products prod ON prod.id = ct.product_id
    LEFT JOIN customer_vehicles cv ON cv.id = ct.vehicle_id
    WHERE ct.shift_id = ${shiftId}
      AND ct.transaction_type = 'Credit Sale'
      AND ct.reference_type = 'CREDIT_SALE'), '[]'::jsonb)
`;

/**
 * Consolidated close-shift read (#229): shift row (locked FOR UPDATE), nozzle
 * readings, station nozzles, drawer totals, and credit sales — ONE statement
 * instead of five sequential port reads under the station advisory lock.
 */
export class DrizzleCloseShiftContextReader implements CloseShiftContextReader {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string, shiftId: string): Promise<CloseShiftContext> {
    const [row] = (await this.db.execute(sql`
      WITH locked_shift AS (
        SELECT * FROM shifts WHERE id = ${shiftId} FOR UPDATE
      )
      SELECT
        (SELECT ${rowJson(schema.shifts, 's')} FROM locked_shift s) AS shift,
        COALESCE((SELECT jsonb_agg(${rowJson(schema.nozzleReadings, 'nr')} ORDER BY nr.created_at, nr.id)
          FROM nozzle_readings nr WHERE nr.shift_id = ${shiftId}), '[]'::jsonb) AS readings,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'productId', n.product_id, 'tankId', n.tank_id))
          FROM nozzles n
          WHERE n.organization_id = ${organizationId}
            AND n.station_id = (SELECT station_id FROM locked_shift)), '[]'::jsonb) AS nozzles,
        ${reconTotalsJson(shiftId)} AS recon,
        ${CREDIT_SALE_JSON(shiftId)} AS credit_sales
    `)) as unknown as [Record<string, any>];

    return {
      shift: (row.shift as CloseShiftContext['shift']) ?? null,
      readings: (row.readings as CloseShiftContext['readings']) ?? [],
      nozzles: (row.nozzles as CloseShiftContext['nozzles']) ?? [],
      totals: assembleReconTotals(row.recon ?? {}),
      creditSales: (row.credit_sales as CloseShiftContext['creditSales']) ?? [],
    };
  }
}

// ---------------- Stock Movements ----------------
export class DrizzleStockMovementWriter implements StockMovementWriter {
  constructor(private readonly db: DbClient) {}
  async saveMany(movements: StockMovementInput[]): Promise<void> {
    if (movements.length === 0) return;
    await this.db.insert(schema.stockMovements).values(
      movements.map((m) => ({
        shiftId: m.shiftId,
        businessDayId: m.businessDayId,
        productId: m.productId,
        tankId: m.tankId,
        movementType: m.movementType,
        quantity: m.quantity,
        referenceType: m.referenceType ?? null,
        referenceId: m.referenceId ?? null,
        notes: m.notes ?? null,
        createdAt: new Date(),
      })),
    );
  }
}

// ---------------- Shift Summaries ----------------
export class DrizzleShiftSummaryWriter implements ShiftSummaryStore {
  constructor(private readonly db: DbClient) {}
  async save(shiftId: string, snapshot: Record<string, unknown>): Promise<void> {
    // Replace-in-one-statement: shift_summaries has no unique index on shift_id,
    // so the swap is a data-modifying CTE instead of a delete + insert pair (#229).
    await this.db.execute(sql`
      WITH removed AS (
        DELETE FROM shift_summaries WHERE shift_id = ${shiftId}
      )
      INSERT INTO shift_summaries (shift_id, snapshot_data, generated_at)
      VALUES (${shiftId}, ${JSON.stringify(snapshot)}::jsonb, now())
    `);
  }
  async deleteForShift(shiftId: string): Promise<void> {
    await this.db.delete(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, shiftId));
  }
  async findByShift(shiftId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select({ snapshotData: schema.shiftSummaries.snapshotData })
      .from(schema.shiftSummaries)
      .where(eq(schema.shiftSummaries.shiftId, shiftId))
      .limit(1);
    return (row?.snapshotData as Record<string, unknown>) ?? null;
  }
}

// ---------------- Credit Sales ----------------
export class DrizzleCreditSalesReader implements CreditSalesReader {
  constructor(private readonly db: DbClient) {}

  async listByShift(shiftId: string): Promise<CreditSaleRecord[]> {
    const rows = await this.db
      .select({
        ct: schema.customerTransactions,
        customerName: schema.customers.name,
        productName: schema.products.name,
        productCode: schema.products.code,
        registrationNumber: schema.customerVehicles.registrationNumber,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .leftJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId),
      )
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shiftId),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      );

    return rows.map((r) => ({
      id: r.ct.id,
      amount: Number(r.ct.amount),
      quantity: r.ct.quantity != null ? Number(r.ct.quantity) : null,
      unitPrice: r.ct.unitPrice != null ? Number(r.ct.unitPrice) : null,
      notes: r.ct.notes ?? null,
      duId: r.ct.duId ?? null,
      attendantId: r.ct.attendantId ?? null,
      customerId: r.ct.customerId ?? '',
      vehicleId: r.ct.vehicleId ?? null,
      productId: r.ct.productId ?? null,
      customerName: r.customerName ?? 'Customer',
      productName: r.productName ?? null,
      productCode: r.productCode ?? null,
      vehicleNumber: r.registrationNumber ?? null,
    }));
  }
}
