import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbClient, type DbExecutor } from '@pump/db';
import { dssrFuelSalesValue, dssrNetVolume, dssrProductSalesValue } from '../dssr-snapshot-sql.js';
import type {
  BusinessDayListQuery,
  BusinessDayListReader,
  BusinessDayListSource,
  DssrDataReader,
  DssrSnapshot,
  DssrSnapshotRepository,
  DssrSourceData,
} from '@pump/core';
import { shiftSequenceSql } from '../shift-sequence-sql.js';

export class DrizzleDssrSnapshotRepository implements DssrSnapshotRepository {
  constructor(private readonly db: DbExecutor) {}
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
  async findByStationDate(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<DssrSnapshot | null> {
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
  constructor(private readonly db: DbExecutor) {}
  async readBusinessDay(businessDayId: string): Promise<DssrSourceData> {
    const [businessDay] = await this.db
      .select({
        organizationId: schema.businessDays.organizationId,
        stationId: schema.businessDays.stationId,
      })
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
        shiftSequence: shiftSequenceSql('shifts'),
        templateName: schema.shiftTemplates.name,
      })
      .from(schema.shiftSummaries)
      .innerJoin(schema.shifts, eq(schema.shiftSummaries.shiftId, schema.shifts.id))
      .leftJoin(schema.shiftTemplates, eq(schema.shiftTemplates.id, schema.shifts.shiftTemplateId))
      .where(eq(schema.shifts.businessDayId, businessDayId));

    const purchaseRows = await this.db
      .select({ amount: schema.purchases.amount })
      .from(schema.purchases)
      .where(eq(schema.purchases.businessDayId, businessDayId));

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
      .select({
        productId: schema.saleItems.productId,
        quantity: schema.saleItems.quantity,
        lineTotal: schema.saleItems.lineTotal,
        taxCategory: schema.saleItems.taxCategory,
        taxableAmount: schema.saleItems.taxableAmount,
        cgst: schema.saleItems.cgst,
        sgst: schema.saleItems.sgst,
        igst: schema.saleItems.igst,
        vat: schema.saleItems.vat,
        cess: schema.saleItems.cess,
      })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.sales.id, schema.saleItems.saleId))
      .where(eq(schema.sales.businessDayId, businessDayId));

    // Credit receivables created today, with customer type (normal vs fleet).
    const creditSaleRows = await this.db
      .select({
        customerType: schema.customers.customerType,
        amount: schema.customerTransactions.amount,
      })
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
        tankId: schema.stockVariances.tankId,
        productId: schema.stockVariances.productId,
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
          .select({
            id: schema.products.id,
            name: schema.products.name,
            code: schema.products.code,
            unit: schema.products.unit,
            costBasis: schema.products.costBasis,
          })
          .from(schema.products)
          .where(eq(schema.products.organizationId, organizationId))
      : [];
    const nozzleRows = stationId
      ? await this.db
          .select({ id: schema.nozzles.id, name: schema.nozzles.name })
          .from(schema.nozzles)
          .where(eq(schema.nozzles.stationId, stationId))
      : [];

    const products: Record<
      string,
      { name: string; code: string; unit: string; costBasis: number }
    > = {};
    for (const p of productRows)
      products[p.id] = {
        name: p.name,
        code: p.code ?? '',
        unit: p.unit ?? 'L',
        costBasis: Number(p.costBasis ?? 0),
      };
    const nozzles: Record<string, string> = {};
    for (const n of nozzleRows) nozzles[n.id] = n.name;

    return {
      shiftSummaries: summaryRows.map((r) => ({
        shiftId: r.shiftId,
        templateName: r.templateName ?? null,
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
        shiftSequence: r.shiftSequence ?? null,
        snapshot: (r.snapshotData as Record<string, unknown>) ?? {},
      })),
      purchases: purchaseRows.map((r) => ({ amount: Number(r.amount) })),
      sales: saleRows.map((r) => ({
        paymentMethod: r.paymentMethod,
        saleType: r.saleType,
        totalAmount: Number(r.totalAmount),
      })),
      creditSales: creditSaleRows.map((r) => ({
        customerType: r.customerType ?? 'Regular',
        amount: Number(r.amount),
      })),
      stockVariances: varianceRows.map((r) => ({
        tankId: r.tankId ?? null,
        productId: r.productId,
        tankName: r.tankName ?? 'Unknown',
        productName: r.productName ?? 'Unknown',
        unit: r.unit ?? '',
        inventoryType: r.inventoryType ?? 'ITEM',
        expectedQuantity: Number(r.expectedQuantity),
        actualQuantity: Number(r.actualQuantity),
        varianceQuantity: Number(r.varianceQuantity),
        reason: r.reason ?? null,
      })),
      saleItems: saleItemRows.map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity),
        revenue: Number(r.lineTotal),
        taxCategory: r.taxCategory ?? null,
        taxableAmount: r.taxableAmount != null ? Number(r.taxableAmount) : null,
        cgst: Number(r.cgst ?? 0),
        sgst: Number(r.sgst ?? 0),
        igst: Number(r.igst ?? 0),
        vat: Number(r.vat ?? 0),
        cess: Number(r.cess ?? 0),
      })),
      products,
      nozzles,
    };
  }
}

/**
 * Business Day list reader (#394): the Reports tab's month page in ONE
 * statement, whatever the number of days, Shifts or Sales.
 *
 * - CLOSED days: scalars are extracted from `dssr_snapshots.snapshot_data` (a
 *   snapshot exists iff the day was closed); the snapshot JSON never reaches the
 *   Worker. The paths live in `infra/dssr-snapshot-sql.ts`. A CLOSED day with no
 *   snapshot is reported `hasSnapshot: false` with no figures — it is not rolled
 *   up, because it is not Sealed.
 * - OPEN days: rolled up from that day's Shift Summaries plus its Sales,
 *   grouped in SQL. This is the same arithmetic `composeDssr` does (net fuel
 *   litres, Σ fuel sales value, Σ office cash variance, Σ sale totals), minus
 *   everything the list does not show. The live DSSR preview is deliberately not
 *   built here — only for the one day a user opens.
 *
 * Every table is reached through an organization/station-scoped `business_days`
 * row, so a foreign stationId yields no rows.
 */
export class DrizzleBusinessDayListReader implements BusinessDayListReader {
  constructor(private readonly db: DbExecutor) {}

  async load(q: BusinessDayListQuery): Promise<BusinessDayListSource> {
    const [row] = (await this.db.execute(sql`
      WITH days AS (
        SELECT bd.id, bd.business_date, bd.status
        FROM business_days bd
        WHERE bd.organization_id = ${q.organizationId} AND bd.station_id = ${q.stationId}
          AND ((bd.business_date >= ${q.monthFrom} AND bd.business_date <= ${q.monthTo})
            OR (bd.business_date >= ${q.weekFrom} AND bd.business_date <= ${q.currentBusinessDate}))
      ),
      snap AS (
        SELECT DISTINCT ON (ds.business_date) ds.business_date, ds.snapshot_data AS data
        FROM dssr_snapshots ds
        WHERE ds.organization_id = ${q.organizationId} AND ds.station_id = ${q.stationId}
          AND ds.business_date IN (SELECT d.business_date FROM days d WHERE d.status = 'CLOSED')
        ORDER BY ds.business_date, ds.generated_at DESC
      ),
      unsealed AS (
        SELECT d.id, d.business_date
        FROM days d
        WHERE d.status <> 'CLOSED'
      ),
      shift_roll AS (
        SELECT s.business_day_id AS id,
          COUNT(*)::int AS shift_count,
          SUM((ss.snapshot_data ->> 'totalFuelSalesValue')::numeric) AS fuel_sales,
          SUM(COALESCE((ss.snapshot_data ->> 'totalNetVolume')::numeric,
                       (ss.snapshot_data ->> 'totalVolume')::numeric
                         - COALESCE((ss.snapshot_data ->> 'totalTesting')::numeric, 0))) AS volume,
          SUM((ss.snapshot_data ->> 'cashVariance')::numeric) AS cash_variance
        FROM shifts s
        JOIN shift_summaries ss ON ss.shift_id = s.id
        WHERE s.business_day_id IN (SELECT u.id FROM unsealed u)
        GROUP BY s.business_day_id
      ),
      sale_roll AS (
        SELECT sa.business_day_id AS id, SUM(sa.total_amount) AS product_sales
        FROM sales sa
        WHERE sa.business_day_id IN (SELECT u.id FROM unsealed u)
        GROUP BY sa.business_day_id
      ),
      figures AS (
        SELECT
          d.business_date AS "businessDate",
          d.status AS "dayStatus",
          (sn.business_date IS NOT NULL) AS "hasSnapshot",
          COALESCE(CASE WHEN sn.business_date IS NOT NULL
            THEN ${dssrFuelSalesValue('sn.data')} ELSE sh.fuel_sales END, 0) AS "fuelSales",
          COALESCE(CASE WHEN sn.business_date IS NOT NULL
            THEN ${dssrProductSalesValue('sn.data')} ELSE sl.product_sales END, 0)
            AS "productSales",
          COALESCE(CASE WHEN sn.business_date IS NOT NULL
            THEN ${dssrNetVolume('sn.data')} ELSE sh.volume END, 0) AS "volume",
          COALESCE(CASE WHEN sn.business_date IS NOT NULL
            THEN (sn.data -> 'drawer' ->> 'totalCashVariance')::numeric ELSE sh.cash_variance END, 0)
            AS "cashVariance",
          COALESCE(CASE WHEN sn.business_date IS NOT NULL
            THEN (sn.data ->> 'shiftsIncluded')::int ELSE sh.shift_count END, 0) AS "shiftCount"
        FROM days d
        LEFT JOIN snap sn ON sn.business_date = d.business_date AND d.status = 'CLOSED'
        LEFT JOIN shift_roll sh ON sh.id = d.id
        LEFT JOIN sale_roll sl ON sl.id = d.id
      )
      SELECT
        COALESCE((SELECT json_agg(f) FROM figures f), '[]'::json) AS days,
        (SELECT COUNT(*)::int FROM business_days bd
          WHERE bd.organization_id = ${q.organizationId} AND bd.station_id = ${q.stationId}
            AND bd.status = 'OPEN' AND bd.business_date < ${q.currentBusinessDate}) AS "openPastDays",
        (SELECT MAX(bd.business_date) FROM business_days bd
          WHERE bd.organization_id = ${q.organizationId} AND bd.station_id = ${q.stationId}
            AND bd.business_date < ${q.monthFrom}) AS "olderBusinessDate"
    `)) as unknown as Array<{
      days: Array<Record<string, unknown>> | null;
      openPastDays: number | string | null;
      olderBusinessDate: string | null;
    }>;

    return {
      days: (row?.days ?? []).map((d) => ({
        businessDate: String(d.businessDate),
        dayStatus: d.dayStatus === 'CLOSED' ? 'CLOSED' : 'OPEN',
        hasSnapshot: d.hasSnapshot === true,
        fuelSales: Number(d.fuelSales ?? 0),
        productSales: Number(d.productSales ?? 0),
        volume: Number(d.volume ?? 0),
        cashVariance: Number(d.cashVariance ?? 0),
        shiftCount: Number(d.shiftCount ?? 0),
      })),
      openPastDays: Number(row?.openPastDays ?? 0),
      olderBusinessDate: row?.olderBusinessDate ?? null,
    };
  }
}
