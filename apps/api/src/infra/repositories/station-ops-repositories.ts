import { and, eq, inArray, desc } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  BusinessDay,
  BusinessDayRepository,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
  NozzleReading,
  NozzleReadingRepository,
  ShiftReconciliationReader,
  ShiftReconciliationTotals,
  StockMovementInput,
  StockMovementWriter,
  ShiftSummaryWriter,
} from '@pump/core';

export class DrizzleBusinessDayRepository implements BusinessDayRepository {
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
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
}

// ---------------- Shifts ----------------
export class DrizzleShiftRepository implements ShiftRepository {
  constructor(private readonly db: DbClient) {}
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

// ---------------- Shift Reconciliation (drawer model) ----------------
export class DrizzleShiftReconciliationReader implements ShiftReconciliationReader {
  constructor(private readonly db: DbClient) {}
  async totalsForShift(shiftId: string): Promise<ShiftReconciliationTotals> {
    const collections = await this.db.select().from(schema.collections).where(eq(schema.collections.shiftId, shiftId));
    const expenses = await this.db.select().from(schema.expenses).where(eq(schema.expenses.shiftId, shiftId));
    const supplierTxns = await this.db.select().from(schema.supplierTransactions).where(eq(schema.supplierTransactions.shiftId, shiftId));

    const sumBy = (rows: { amount: string; paymentMethod?: string }[], method: string) =>
      rows.filter((r) => r.paymentMethod === method).reduce((acc, r) => acc + Number(r.amount), 0);

    return {
      cashCollections: sumBy(collections, 'Cash'),
      cardCollections: sumBy(collections, 'Card'),
      upiCollections: sumBy(collections, 'UPI'),
      creditCollections: sumBy(collections, 'Credit'),
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
