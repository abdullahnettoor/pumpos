import { and, eq, inArray, desc, lt, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  BusinessDay,
  BusinessDayRepository,
  BusinessDayLock,
  BusinessDayStatusReader,
  BusinessDayStatusItem,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
  NozzleReading,
  NozzleReadingRepository,
  ShiftReconciliationReader,
  ShiftReconciliationTotals,
  CreditSalesReader,
  CreditSaleRecord,
  StockMovementInput,
  StockMovementWriter,
  ShiftSummaryWriter,
  AcceptedHandoverReading,
  AttendantHandover,
  HandoverContext,
  HandoverContextReader,
  HandoverRepository,
  HandoverTerminalEntry,
} from '@pump/core';

export class DrizzleBusinessDayStatusReader implements BusinessDayStatusReader {
  constructor(private readonly db: DbClient) {}

  private projection() {
    return {
      id: schema.businessDays.id,
      businessDate: schema.businessDays.businessDate,
      status: schema.businessDays.status,
      openedAt: schema.businessDays.openedAt,
      closedAt: schema.businessDays.closedAt,
      openShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = ${schema.businessDays.id} AND s.status = 'OPEN')`,
      closedShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = ${schema.businessDays.id} AND s.status IN ('CLOSED', 'LOCKED'))`,
      lastActivityAt: sql<Date>`GREATEST(
        ${schema.businessDays.updatedAt},
        COALESCE((SELECT MAX(s.updated_at) FROM shifts s WHERE s.business_day_id = ${schema.businessDays.id}), ${schema.businessDays.updatedAt}),
        COALESCE((SELECT MAX(e.occurred_at) FROM events e WHERE e.business_day_id = ${schema.businessDays.id}), ${schema.businessDays.updatedAt})
      )`,
    };
  }

  private toItem(row: any): BusinessDayStatusItem {
    return {
      ...row,
      status: row.status as BusinessDayStatusItem['status'],
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      openShiftCount: Number(row.openShiftCount),
      closedShiftCount: Number(row.closedShiftCount),
      lastActivityAt: row.lastActivityAt.toISOString(),
    };
  }

  async findByDate(organizationId: string, stationId: string, businessDate: string): Promise<BusinessDayStatusItem | null> {
    const [row] = await this.db.select(this.projection()).from(schema.businessDays).where(and(
      eq(schema.businessDays.organizationId, organizationId),
      eq(schema.businessDays.stationId, stationId),
      eq(schema.businessDays.businessDate, businessDate),
    )).limit(1);
    return row ? this.toItem(row) : null;
  }

  async listPastOpen(organizationId: string, stationId: string, currentBusinessDate: string): Promise<BusinessDayStatusItem[]> {
    const rows = await this.db.select(this.projection()).from(schema.businessDays).where(and(
      eq(schema.businessDays.organizationId, organizationId),
      eq(schema.businessDays.stationId, stationId),
      eq(schema.businessDays.status, 'OPEN'),
      lt(schema.businessDays.businessDate, currentBusinessDate),
    )).orderBy(desc(schema.businessDays.businessDate));
    return rows.map((row) => this.toItem(row));
  }

  async listOpen(organizationId: string, stationId: string): Promise<BusinessDayStatusItem[]> {
    const rows = await this.db.select(this.projection()).from(schema.businessDays).where(and(
      eq(schema.businessDays.organizationId, organizationId),
      eq(schema.businessDays.stationId, stationId),
      eq(schema.businessDays.status, 'OPEN'),
    )).orderBy(desc(schema.businessDays.businessDate));
    return rows.map((row) => this.toItem(row));
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
    const [r] = await this.db.select().from(schema.businessDays).where(eq(schema.businessDays.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }

  async lockById(organizationId: string, businessDayId: string): Promise<void> {
    await this.db.select({ id: schema.businessDays.id }).from(schema.businessDays).where(and(
      eq(schema.businessDays.id, businessDayId),
      eq(schema.businessDays.organizationId, organizationId),
    )).for('update');
  }

  async lockStation(organizationId: string, stationId: string): Promise<void> {
    await this.db.select({ id: schema.stations.id }).from(schema.stations).where(and(
      eq(schema.stations.id, stationId),
      eq(schema.stations.organizationId, organizationId),
    )).for('update');
  }

  async lockByStationAndDate(organizationId: string, stationId: string, businessDate: string): Promise<void> {
    await this.db.select({ id: schema.businessDays.id }).from(schema.businessDays).where(and(
      eq(schema.businessDays.organizationId, organizationId),
      eq(schema.businessDays.stationId, stationId),
      eq(schema.businessDays.businessDate, businessDate),
    )).for('update');
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

  async findByStationAndDate(organizationId: string, stationId: string, businessDate: string): Promise<BusinessDay | null> {
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
    const [row] = await this.db.select({ id: schema.shifts.id }).from(schema.shifts).where(and(
      eq(schema.shifts.businessDayId, businessDayId),
      eq(schema.shifts.status, 'OPEN'),
    )).limit(1);
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
    const [r] = await this.db.select().from(schema.shifts).where(eq(schema.shifts.id, id)).limit(1).for('update');
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
      .where(and(eq(schema.shifts.organizationId, organizationId), eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
  async addStaffAssignments(shiftId: string, assignments: StaffAssignmentInput[]): Promise<void> {
    if (assignments.length === 0) return;
    await this.db.insert(schema.shiftStaffAssignments).values(assignments.map((a) => ({ shiftId, userId: a.userId, duId: a.duId })));
  }
  async addTerminalLinks(shiftId: string, links: TerminalLinkInput[]): Promise<void> {
    if (links.length === 0) return;
    await this.db.insert(schema.shiftTerminalLinks).values(links.map((l) => ({ shiftId, terminalId: l.terminalId, duId: l.duId ?? null })));
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
    const rows = await this.db.select().from(schema.nozzleReadings).where(eq(schema.nozzleReadings.shiftId, shiftId));
    return rows.map((r) => this.toEntity(r));
  }
  async updateClosing(id: string, closingReading: string, volumeSold: string): Promise<void> {
    await this.db.update(schema.nozzleReadings).set({ closingReading, volumeSold }).where(eq(schema.nozzleReadings.id, id));
  }
}

// ---------------- Attendant Handover ----------------
export class DrizzleHandoverContextReader implements HandoverContextReader {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string, stationId: string, shiftId: string, attendantId: string, duId: string): Promise<HandoverContext> {
    const [attendantRows, dispenserRows, assignmentRows, readingRows, terminalRows, creditRows, omcRows, merchandiseRows] = await Promise.all([
      this.db.select().from(schema.users).where(and(eq(schema.users.id, attendantId), eq(schema.users.organizationId, organizationId))).limit(1),
      this.db.select().from(schema.dispenserUnits).where(and(
        eq(schema.dispenserUnits.id, duId),
        eq(schema.dispenserUnits.organizationId, organizationId),
        eq(schema.dispenserUnits.stationId, stationId),
      )).limit(1),
      this.db.select({ id: schema.shiftStaffAssignments.id }).from(schema.shiftStaffAssignments)
        .innerJoin(schema.shifts, and(
          eq(schema.shifts.id, schema.shiftStaffAssignments.shiftId),
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
        ))
        .where(and(
          eq(schema.shiftStaffAssignments.shiftId, shiftId),
          eq(schema.shiftStaffAssignments.userId, attendantId),
          eq(schema.shiftStaffAssignments.duId, duId),
        )).limit(1),
      this.db.select({ reading: schema.nozzleReadings, nozzle: schema.nozzles }).from(schema.nozzles)
        .leftJoin(schema.nozzleReadings, and(
          eq(schema.nozzleReadings.nozzleId, schema.nozzles.id),
          eq(schema.nozzleReadings.shiftId, shiftId),
        ))
        .where(and(
          eq(schema.nozzles.organizationId, organizationId),
          eq(schema.nozzles.stationId, stationId),
          eq(schema.nozzles.duId, duId),
        )),
      this.db.select({ terminal: schema.paymentTerminals, linkedDuId: schema.shiftTerminalLinks.duId })
        .from(schema.paymentTerminals)
        .leftJoin(schema.shiftTerminalLinks, and(
          eq(schema.shiftTerminalLinks.terminalId, schema.paymentTerminals.id),
          eq(schema.shiftTerminalLinks.shiftId, shiftId),
        ))
        .where(and(
          eq(schema.paymentTerminals.organizationId, organizationId),
          eq(schema.paymentTerminals.stationId, stationId),
          eq(schema.paymentTerminals.isActive, true),
        )),
      this.db.select({ amount: schema.customerTransactions.amount }).from(schema.customerTransactions)
        .innerJoin(schema.shifts, and(
          eq(schema.shifts.id, schema.customerTransactions.shiftId),
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
        ))
        .where(and(
          eq(schema.customerTransactions.shiftId, shiftId),
          eq(schema.customerTransactions.attendantId, attendantId),
          eq(schema.customerTransactions.duId, duId),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        )),
      this.db.select({ amount: schema.customerTransactions.amount }).from(schema.customerTransactions)
        .innerJoin(schema.shifts, and(
          eq(schema.shifts.id, schema.customerTransactions.shiftId),
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
        ))
        .where(and(
          eq(schema.customerTransactions.shiftId, shiftId),
          eq(schema.customerTransactions.attendantId, attendantId),
          eq(schema.customerTransactions.duId, duId),
          eq(schema.customerTransactions.transactionType, 'OMC Sale'),
          eq(schema.customerTransactions.referenceType, 'OMC_CARD_SALE'),
        )),
      this.db.select({ total: schema.sales.totalAmount, nonCash: schema.sales.nonCashAmount }).from(schema.sales)
        .innerJoin(schema.shifts, and(
          eq(schema.shifts.id, schema.sales.shiftId),
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
        ))
        .where(and(
          eq(schema.sales.shiftId, shiftId),
          eq(schema.sales.attendantId, attendantId),
          ne(schema.sales.saleType, 'Fuel'),
          eq(schema.sales.paymentMethod, 'Cash'),
        )),
    ]);

    const attendant = attendantRows[0];
    const dispenser = dispenserRows[0];
    return {
      attendant: attendant ? { id: attendant.id, organizationId: attendant.organizationId, fullName: attendant.fullName, role: attendant.role, status: attendant.status } : null,
      dispenser: dispenser ? {
        id: dispenser.id,
        organizationId: dispenser.organizationId,
        stationId: dispenser.stationId,
        name: dispenser.name,
        code: dispenser.code,
        status: dispenser.status,
      } : null,
      assigned: assignmentRows.length > 0,
      nozzleReadings: readingRows.filter((row) => row.reading !== null).map(({ reading, nozzle }) => ({
        ...this.toHandoverReading(reading!),
        organizationId: nozzle.organizationId,
        stationId: nozzle.stationId,
        duId: nozzle.duId,
        nozzleName: nozzle.name,
      })),
      missingReadingNozzleIds: readingRows.filter((row) => row.reading === null).map((row) => row.nozzle.id),
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
      merchandiseCash: merchandiseRows.reduce((sum, row) => sum + Number(row.total) - Number(row.nonCash ?? 0), 0),
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
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${handover.organizationId}:${handover.stationId}:${handover.shiftId}:${handover.attendantId}:${handover.duId}`}, 0))`);
    const [existing] = await this.db.select({ id: schema.attendantHandovers.id }).from(schema.attendantHandovers).where(and(
      eq(schema.attendantHandovers.organizationId, handover.organizationId),
      eq(schema.attendantHandovers.stationId, handover.stationId),
      eq(schema.attendantHandovers.shiftId, handover.shiftId),
      eq(schema.attendantHandovers.userId, handover.attendantId),
      eq(schema.attendantHandovers.duId, handover.duId),
    )).limit(1);
    const [row] = await this.db.insert(schema.attendantHandovers).values({
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
    }).onConflictDoUpdate({
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
    }).returning();

    await this.db.delete(schema.handoverTerminalEntries).where(eq(schema.handoverTerminalEntries.handoverId, row.id));
    const savedEntries = terminalEntries.length > 0
      ? await this.db.insert(schema.handoverTerminalEntries).values(terminalEntries.map((entry) => ({
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
        }))).returning()
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
    for (const reading of readings) {
      await this.db.update(schema.nozzleReadings).set({
        closingReading: String(reading.closingReading),
        volumeSold: String(reading.grossVolume),
        testingVolume: String(reading.testingVolume),
      }).where(eq(schema.nozzleReadings.id, reading.id));
    }
  }
}

// ---------------- Shift Reconciliation (drawer model) ----------------
export class DrizzleShiftReconciliationReader implements ShiftReconciliationReader {
  constructor(private readonly db: DbClient) {}
  async totalsForShift(shiftId: string): Promise<ShiftReconciliationTotals> {
    const collections = await this.db.select().from(schema.collections).where(eq(schema.collections.shiftId, shiftId));
    const expenses = await this.db.select().from(schema.expenses).where(eq(schema.expenses.shiftId, shiftId));
    const supplierTxns = await this.db.select().from(schema.supplierTransactions).where(eq(schema.supplierTransactions.shiftId, shiftId));
    const sales = await this.db.select().from(schema.sales).where(eq(schema.sales.shiftId, shiftId));
    const handovers = await this.db.select().from(schema.attendantHandovers).where(eq(schema.attendantHandovers.shiftId, shiftId));
    const incomeRows = await this.db.select().from(schema.otherIncome).where(eq(schema.otherIncome.shiftId, shiftId));

    const sumBy = (rows: { amount: string; paymentMethod?: string }[], method: string) =>
      rows.filter((r) => r.paymentMethod === method).reduce((acc, r) => acc + Number(r.amount), 0);

    // Cash sales for the drawer = the cash attendants declared in their DU handovers
    // (fuel cash is never a `sales` row — it's metered and declared at handover),
    // PLUS merchandise cash from sellers who have NO handover (office/counter staff),
    // whose cash isn't captured anywhere else. Attendants' own merch cash is already
    // inside their handover cashHandedOver. Fall back to all merch cash when there
    // are no handovers at all (legacy / handover-less shifts).
    const handoverCash = handovers.reduce((acc, h) => acc + Number(h.cashHandedOver ?? 0), 0);
    const handoverUserIds = new Set(handovers.map((h) => h.userId));
    const cashSaleRows = sales.filter((s) => s.paymentMethod === 'Cash');
    // Cash portion = total − non-cash (card/UPI) portion (Option B).
    const cashPortion = (s: { totalAmount: string; nonCashAmount?: string | null }) =>
      Number(s.totalAmount) - Number(s.nonCashAmount ?? 0);
    const merchCashSales = cashSaleRows.reduce((acc, s) => acc + cashPortion(s), 0);
    const outsideRows = cashSaleRows.filter((s) => !(s.attendantId && handoverUserIds.has(s.attendantId)));
    const nonHandoverMerchCash = outsideRows.reduce((acc, s) => acc + cashPortion(s), 0);

    // Per-seller breakdown of the non-attendant (outside-handover) merch cash,
    // computed from the SAME rows as the total so the two always reconcile. Names
    // resolved via a users lookup (same pattern as the merchandise panel); sales
    // with no seller fall under "Counter / unassigned".
    const rowsForBreakdown = handovers.length > 0 ? outsideRows : cashSaleRows;
    const bySeller = new Map<string, number>();
    for (const s of rowsForBreakdown) {
      const key = (s as { attendantId?: string | null }).attendantId ?? 'unassigned';
      bySeller.set(key, (bySeller.get(key) ?? 0) + cashPortion(s));
    }
    const sellerIds = [...bySeller.keys()].filter((k) => k !== 'unassigned');
    const sellerNameRows = sellerIds.length
      ? await this.db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, sellerIds))
      : [];
    const nameById = new Map(sellerNameRows.map((u) => [u.id, u.fullName]));
    const merchCashOutsideHandoverBreakdown = [...bySeller.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([key, amount]) => ({ sellerName: key === 'unassigned' ? 'Counter / unassigned' : (nameById.get(key) ?? 'Unknown'), amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      cashSales: handovers.length > 0 ? handoverCash + nonHandoverMerchCash : merchCashSales,
      handoverCash: handovers.length > 0 ? handoverCash : 0,
      merchCashOutsideHandover: handovers.length > 0 ? nonHandoverMerchCash : merchCashSales,
      merchCashOutsideHandoverBreakdown,
      cashCollections: sumBy(collections, 'Cash'),
      cardCollections: sumBy(collections, 'Card'),
      upiCollections: sumBy(collections, 'UPI'),
      creditCollections: sumBy(collections, 'Credit'),
      cashIncome: incomeRows
        .filter((i) => i.affectsDrawer && i.status !== 'VOIDED')
        .reduce((acc, i) => acc + Number(i.amount), 0),
      drawerExpenses: expenses
        .filter((e) => e.affectsDrawer && e.status !== 'VOIDED')
        .reduce((acc, e) => acc + Number(e.amount), 0),
      drawerSupplierPayments: supplierTxns
        .filter((t) => t.transactionType === 'Payment' && t.affectsDrawer)
        .reduce((acc, t) => acc + Number(t.amount), 0),
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
export class DrizzleShiftSummaryWriter implements ShiftSummaryWriter {
  constructor(private readonly db: DbClient) {}
  async save(shiftId: string, snapshot: Record<string, unknown>): Promise<void> {
    await this.db.delete(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, shiftId));
    await this.db.insert(schema.shiftSummaries).values({ shiftId, snapshotData: snapshot, generatedAt: new Date() });
  }
  async deleteForShift(shiftId: string): Promise<void> {
    await this.db.delete(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, shiftId));
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
      .leftJoin(schema.customerVehicles, eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId))
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
