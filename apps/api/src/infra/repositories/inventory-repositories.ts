import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbClient, type DbExecutor } from '@pump/db';
import type {
  StockMovement,
  TankSalesWindow,
  TankSalesWindowQuery,
  TankSalesWindowReader,
  StockMovementRepository,
  StockVariance,
  StockVarianceRepository,
} from '@pump/core';

export class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(private readonly db: DbExecutor) {}

  async save(m: StockMovement): Promise<void> {
    await this.db.insert(schema.stockMovements).values({
      id: m.id,
      shiftId: m.shiftId,
      businessDayId: m.businessDayId,
      productId: m.productId,
      tankId: m.tankId,
      movementType: m.movementType,
      quantity: m.quantity,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      notes: m.notes,
      createdAt: new Date(m.createdAt),
    });
  }

  async saveMany(movements: StockMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await this.db.insert(schema.stockMovements).values(
      movements.map((m) => ({
        id: m.id,
        shiftId: m.shiftId,
        businessDayId: m.businessDayId,
        productId: m.productId,
        tankId: m.tankId,
        movementType: m.movementType,
        quantity: m.quantity,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        notes: m.notes,
        createdAt: new Date(m.createdAt),
      })),
    );
  }

  async currentQuantityForTank(tankId: string): Promise<number> {
    const [r] = await this.db
      .select({ total: sql<string>`coalesce(sum(${schema.stockMovements.quantity}), 0)` })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.tankId, tankId));
    return Number(r?.total ?? 0);
  }

  async currentQuantityForProduct(_organizationId: string, productId: string): Promise<number> {
    const [r] = await this.db
      .select({ total: sql<string>`coalesce(sum(${schema.stockMovements.quantity}), 0)` })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.productId, productId));
    return Number(r?.total ?? 0);
  }
}

export class DrizzleStockVarianceRepository implements StockVarianceRepository {
  constructor(private readonly db: DbExecutor) {}

  async save(v: StockVariance): Promise<void> {
    await this.db.insert(schema.stockVariances).values({
      id: v.id,
      organizationId: v.organizationId,
      stationId: v.stationId,
      shiftId: v.shiftId,
      businessDayId: v.businessDayId,
      productId: v.productId,
      tankId: v.tankId,
      expectedQuantity: v.expectedQuantity,
      actualQuantity: v.actualQuantity,
      varianceQuantity: v.varianceQuantity,
      reason: v.reason,
      approvedBy: v.approvedBy,
      metadata: v.metadata ?? {},
      createdAt: new Date(v.createdAt),
    });
  }

  async existsForShift(shiftId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.stockVariances.id })
      .from(schema.stockVariances)
      .where(eq(schema.stockVariances.shiftId, shiftId))
      .limit(1);
    return Boolean(row);
  }
}

/**
 * Read projection: current book stock per tank (bulk) and per product (item)
 * for a station. Bulk = movements joined to tanks at the station; item = product
 * totals for active stock-tracked, non-fuel products.
 */
export async function readInventoryLevels(db: DbClient, organizationId: string, stationId: string) {
  const tanks = await db
    .select()
    .from(schema.tanks)
    .where(
      and(
        eq(schema.tanks.organizationId, organizationId),
        eq(schema.tanks.stationId, stationId),
        eq(schema.tanks.status, 'ACTIVE'),
      ),
    );

  const bulk = [];
  for (const t of tanks) {
    const [r] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.stockMovements.quantity}), 0)` })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.tankId, t.id));
    bulk.push({
      tankId: t.id,
      tankName: t.name,
      productId: t.productId,
      capacity: Number(t.capacity),
      quantity: Number(r?.total ?? 0),
    });
  }

  const items = await db
    .select({
      productId: schema.products.id,
      name: schema.products.name,
      code: schema.products.code,
      quantity: sql<string>`coalesce((select sum(sm.quantity) from stock_movements sm where sm.product_id = "products"."id"), 0)`,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.organizationId, organizationId),
        eq(schema.products.inventoryType, 'ITEM'),
        eq(schema.products.isActive, true),
      ),
    );

  return {
    bulk,
    items: items.map((i) => ({
      productId: i.productId,
      name: i.name,
      code: i.code,
      quantity: Number(i.quantity),
    })),
  };
}

/**
 * Per-tank sold volume over a Station's newest closed Business Days, in ONE
 * statement (core `GetTankDaysOfCover`; averaging rules are documented there).
 *
 * Source: `stock_movements` Sale rows with a tank that Shift close wrote from
 * the nozzle readings (`reference_type = 'reading'`), the inventory source of
 * truth. Fuel is metered, so a POS sale line that names a tank (create-sale
 * accepts one, `reference_type = 'SALE'`) is NOT counted: that would count the
 * same litres twice. DSSR snapshots are not used:
 * they carry no tank id (sold litres are per product), so they cannot tell two
 * tanks of one product apart.
 *
 * Tenancy: `stock_movements` has no organization column, so the window of days
 * is scoped on `business_days` (organization + station) and the tanks are
 * re-checked on `tanks` (organization + station).
 * Indexes: `business_days_org_station_date_uniq` for the window; the movement
 * join filters on `business_day_id` (no index on `stock_movements` yet — see
 * the PR for the proposed `(business_day_id, tank_id)` index).
 */
export class DrizzleTankSalesWindowReader implements TankSalesWindowReader {
  constructor(private readonly db: DbExecutor) {}

  async read(q: TankSalesWindowQuery): Promise<TankSalesWindow> {
    const rows = await this.db.execute(sql`
      WITH window_days AS (
        SELECT bd.id
        FROM business_days bd
        WHERE bd.organization_id = ${q.organizationId} AND bd.station_id = ${q.stationId}
          AND bd.status = 'CLOSED'
        ORDER BY bd.business_date DESC
        LIMIT ${q.days}::int
      ),
      sold AS (
        SELECT sm.tank_id, -SUM(sm.quantity) AS volume
        FROM stock_movements sm
        JOIN window_days wd ON wd.id = sm.business_day_id
        JOIN tanks t ON t.id = sm.tank_id
          AND t.organization_id = ${q.organizationId} AND t.station_id = ${q.stationId}
        WHERE sm.movement_type = 'Sale' AND sm.reference_type = 'reading'
          AND sm.tank_id IS NOT NULL
        GROUP BY sm.tank_id
      )
      SELECT
        (SELECT count(*)::int FROM window_days) AS closed_days,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('tankId', tank_id, 'volume', volume)) FROM sold),
          '[]'::jsonb) AS sold
    `);
    const row = (rows as unknown as Array<{ closed_days: number; sold: unknown }>)[0];
    const sold = Array.isArray(row?.sold)
      ? (row.sold as Array<{ tankId: string; volume: number }>)
      : [];
    return {
      closedDays: Number(row?.closed_days ?? 0),
      sold: sold.map((s) => ({ tankId: String(s.tankId), volume: Number(s.volume) })),
    };
  }
}
