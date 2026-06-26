import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  DssrDataReader,
  DssrSnapshot,
  DssrSnapshotRepository,
  DssrSourceData,
} from '@pump/core';

export class DrizzleDssrSnapshotRepository implements DssrSnapshotRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.dssrSnapshots.$inferSelect): DssrSnapshot {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      businessDate: r.businessDate,
      snapshotData: (r.snapshotData as Record<string, unknown>) ?? {},
      generatedAt: r.generatedAt.toISOString(),
    };
  }
  async findByStationDate(organizationId: string, stationId: string, businessDate: string): Promise<DssrSnapshot | null> {
    const [r] = await this.db
      .select()
      .from(schema.dssrSnapshots)
      .where(
        and(
          eq(schema.dssrSnapshots.organizationId, organizationId),
          eq(schema.dssrSnapshots.stationId, stationId),
          eq(schema.dssrSnapshots.businessDate, businessDate),
        ),
      )
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(s: DssrSnapshot): Promise<void> {
    // Upsert by (station, date): the DSSR is a single snapshot per business day.
    await this.db
      .delete(schema.dssrSnapshots)
      .where(
        and(
          eq(schema.dssrSnapshots.organizationId, s.organizationId),
          eq(schema.dssrSnapshots.stationId, s.stationId),
          eq(schema.dssrSnapshots.businessDate, s.businessDate),
        ),
      );
    await this.db.insert(schema.dssrSnapshots).values({
      id: s.id,
      organizationId: s.organizationId,
      stationId: s.stationId,
      businessDate: s.businessDate,
      snapshotData: s.snapshotData,
      generatedAt: new Date(s.generatedAt),
    });
  }
}

export class DrizzleDssrDataReader implements DssrDataReader {
  constructor(private readonly db: DbClient) {}
  async readBusinessDay(businessDayId: string): Promise<DssrSourceData> {
    const summaryRows = await this.db
      .select({ shiftId: schema.shiftSummaries.shiftId, snapshotData: schema.shiftSummaries.snapshotData })
      .from(schema.shiftSummaries)
      .innerJoin(schema.shifts, eq(schema.shiftSummaries.shiftId, schema.shifts.id))
      .where(eq(schema.shifts.businessDayId, businessDayId));

    const collectionRows = await this.db
      .select({ paymentMethod: schema.collections.paymentMethod, amount: schema.collections.amount })
      .from(schema.collections)
      .where(eq(schema.collections.businessDayId, businessDayId));

    const expenseRows = await this.db
      .select({
        affectsDrawer: schema.expenses.affectsDrawer,
        paidFrom: schema.expenses.paidFrom,
        amount: schema.expenses.amount,
        status: schema.expenses.status,
      })
      .from(schema.expenses)
      .where(eq(schema.expenses.businessDayId, businessDayId));

    const purchaseRows = await this.db
      .select({ amount: schema.purchases.amount })
      .from(schema.purchases)
      .where(eq(schema.purchases.businessDayId, businessDayId));

    const supplierPaymentRows = await this.db
      .select({
        affectsDrawer: schema.supplierTransactions.affectsDrawer,
        paidFrom: schema.supplierTransactions.paidFrom,
        amount: schema.supplierTransactions.amount,
      })
      .from(schema.supplierTransactions)
      .where(
        and(
          eq(schema.supplierTransactions.businessDayId, businessDayId),
          eq(schema.supplierTransactions.transactionType, 'Payment'),
        ),
      );

    const saleRows = await this.db
      .select({
        paymentMethod: schema.sales.paymentMethod,
        saleType: schema.sales.saleType,
        totalAmount: schema.sales.totalAmount,
      })
      .from(schema.sales)
      .where(eq(schema.sales.businessDayId, businessDayId));

    return {
      shiftSummaries: summaryRows.map((r) => ({ shiftId: r.shiftId, snapshot: (r.snapshotData as Record<string, unknown>) ?? {} })),
      collections: collectionRows.map((r) => ({ paymentMethod: r.paymentMethod, amount: Number(r.amount) })),
      expenses: expenseRows.map((r) => ({ affectsDrawer: r.affectsDrawer, paidFrom: r.paidFrom, amount: Number(r.amount), status: r.status })),
      purchases: purchaseRows.map((r) => ({ amount: Number(r.amount) })),
      supplierPayments: supplierPaymentRows.map((r) => ({ affectsDrawer: r.affectsDrawer, paidFrom: r.paidFrom, amount: Number(r.amount) })),
      sales: saleRows.map((r) => ({ paymentMethod: r.paymentMethod, saleType: r.saleType, totalAmount: Number(r.totalAmount) })),
    };
  }
}
