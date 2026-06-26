import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  StockMovement,
  StockMovementRepository,
  StockVariance,
  StockVarianceRepository,
} from '@pump/core';

export class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(private readonly db: DbClient) {}

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
  constructor(private readonly db: DbClient) {}

  async save(v: StockVariance): Promise<void> {
    await this.db.insert(schema.stockVariances).values({
      id: v.id,
      shiftId: v.shiftId,
      businessDayId: v.businessDayId,
      productId: v.productId,
      tankId: v.tankId,
      expectedQuantity: v.expectedQuantity,
      actualQuantity: v.actualQuantity,
      varianceQuantity: v.varianceQuantity,
      reason: v.reason,
      approvedBy: v.approvedBy,
      createdAt: new Date(v.createdAt),
    });
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
    .where(and(eq(schema.tanks.organizationId, organizationId), eq(schema.tanks.stationId, stationId)));

  const bulk = [];
  for (const t of tanks) {
    const [r] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.stockMovements.quantity}), 0)` })
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.tankId, t.id));
    bulk.push({ tankId: t.id, tankName: t.name, productId: t.productId, capacity: Number(t.capacity), quantity: Number(r?.total ?? 0) });
  }

  const items = await db
    .select({
      productId: schema.products.id,
      name: schema.products.name,
      code: schema.products.code,
      quantity: sql<string>`coalesce((select sum(sm.quantity) from stock_movements sm where sm.product_id = ${schema.products.id}), 0)`,
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
    items: items.map((i) => ({ productId: i.productId, name: i.name, code: i.code, quantity: Number(i.quantity) })),
  };
}
