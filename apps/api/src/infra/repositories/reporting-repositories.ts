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
    const [businessDay] = await this.db
      .select({ organizationId: schema.businessDays.organizationId, stationId: schema.businessDays.stationId })
      .from(schema.businessDays)
      .where(eq(schema.businessDays.id, businessDayId))
      .limit(1);
    const organizationId = businessDay?.organizationId;
    const stationId = businessDay?.stationId;

    const summaryRows = await this.db
      .select({
        shiftId: schema.shiftSummaries.shiftId,
        snapshotData: schema.shiftSummaries.snapshotData,
        closedAt: schema.shifts.closedAt,
        templateName: schema.shiftTemplates.name,
      })
      .from(schema.shiftSummaries)
      .innerJoin(schema.shifts, eq(schema.shiftSummaries.shiftId, schema.shifts.id))
      .leftJoin(schema.shiftTemplates, eq(schema.shiftTemplates.id, schema.shifts.shiftTemplateId))
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

    const incomeRows = await this.db
      .select({
        affectsDrawer: schema.otherIncome.affectsDrawer,
        receivedInto: schema.otherIncome.receivedInto,
        amount: schema.otherIncome.amount,
        status: schema.otherIncome.status,
        categoryName: schema.incomeCategories.name,
      })
      .from(schema.otherIncome)
      .leftJoin(schema.incomeCategories, eq(schema.incomeCategories.id, schema.otherIncome.categoryId))
      .where(eq(schema.otherIncome.businessDayId, businessDayId));

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

    // Merchandise sale line items (productId + qty + revenue) for merch COGS + per-product margin.
    const saleItemRows = await this.db
      .select({ productId: schema.saleItems.productId, quantity: schema.saleItems.quantity, lineTotal: schema.saleItems.lineTotal })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.sales.id, schema.saleItems.saleId))
      .where(eq(schema.sales.businessDayId, businessDayId));

    // Credit receivables created today, with customer type (normal vs fleet).
    const creditSaleRows = await this.db
      .select({ customerType: schema.customers.customerType, amount: schema.customerTransactions.amount })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .where(
        and(
          eq(schema.customerTransactions.businessDayId, businessDayId),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
        ),
      );

    // Business-day tank dip / stock-count reconciliation.
    const varianceRows = await this.db
      .select({
        tankName: schema.tanks.name,
        productName: schema.products.name,
        unit: schema.products.unit,
        inventoryType: schema.products.inventoryType,
        expectedQuantity: schema.stockVariances.expectedQuantity,
        actualQuantity: schema.stockVariances.actualQuantity,
        varianceQuantity: schema.stockVariances.varianceQuantity,
        reason: schema.stockVariances.reason,
      })
      .from(schema.stockVariances)
      .leftJoin(schema.tanks, eq(schema.tanks.id, schema.stockVariances.tankId))
      .leftJoin(schema.products, eq(schema.products.id, schema.stockVariances.productId))
      .where(eq(schema.stockVariances.businessDayId, businessDayId));

    // Reference lookups for enriching the fuel roll-up with names + cost basis.
    const productRows = organizationId
      ? await this.db
          .select({ id: schema.products.id, name: schema.products.name, code: schema.products.code, unit: schema.products.unit, costBasis: schema.products.costBasis })
          .from(schema.products)
          .where(eq(schema.products.organizationId, organizationId))
      : [];
    const nozzleRows = stationId
      ? await this.db
          .select({ id: schema.nozzles.id, name: schema.nozzles.name })
          .from(schema.nozzles)
          .where(eq(schema.nozzles.stationId, stationId))
      : [];

    const products: Record<string, { name: string; code: string; unit: string; costBasis: number }> = {};
    for (const p of productRows) products[p.id] = { name: p.name, code: p.code ?? '', unit: p.unit ?? 'L', costBasis: Number(p.costBasis ?? 0) };
    const nozzles: Record<string, string> = {};
    for (const n of nozzleRows) nozzles[n.id] = n.name;

    return {
      shiftSummaries: summaryRows.map((r) => ({
        shiftId: r.shiftId,
        templateName: r.templateName ?? null,
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
        snapshot: (r.snapshotData as Record<string, unknown>) ?? {},
      })),
      collections: collectionRows.map((r) => ({ paymentMethod: r.paymentMethod, amount: Number(r.amount) })),
      expenses: expenseRows.map((r) => ({ affectsDrawer: r.affectsDrawer, paidFrom: r.paidFrom, amount: Number(r.amount), status: r.status })),
      income: incomeRows.map((r) => ({ affectsDrawer: r.affectsDrawer, receivedInto: r.receivedInto, amount: Number(r.amount), status: r.status, categoryName: r.categoryName ?? null })),
      purchases: purchaseRows.map((r) => ({ amount: Number(r.amount) })),
      supplierPayments: supplierPaymentRows.map((r) => ({ affectsDrawer: r.affectsDrawer, paidFrom: r.paidFrom, amount: Number(r.amount) })),
      sales: saleRows.map((r) => ({ paymentMethod: r.paymentMethod, saleType: r.saleType, totalAmount: Number(r.totalAmount) })),
      creditSales: creditSaleRows.map((r) => ({ customerType: r.customerType ?? 'Regular', amount: Number(r.amount) })),
      stockVariances: varianceRows.map((r) => ({
        tankName: r.tankName ?? 'Unknown',
        productName: r.productName ?? 'Unknown',
        unit: r.unit ?? '',
        inventoryType: r.inventoryType ?? 'ITEM',
        expectedQuantity: Number(r.expectedQuantity),
        actualQuantity: Number(r.actualQuantity),
        varianceQuantity: Number(r.varianceQuantity),
        reason: r.reason ?? null,
      })),
      saleItems: saleItemRows.map((r) => ({ productId: r.productId, quantity: Number(r.quantity), revenue: Number(r.lineTotal) })),
      products,
      nozzles,
    };
  }
}
