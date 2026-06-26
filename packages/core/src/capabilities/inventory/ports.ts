/**
 * Inventory engine ports. One movement ledger (`stock_movements`) underlies two
 * inventory models: BULK (fuel tanks, per-tank quantity) and ITEM (packaged
 * stock, per-product quantity). Current/book quantity is the sum of movements.
 */
export type MovementType =
  | 'Purchase'
  | 'Sale'
  | 'Adjustment'
  | 'Decantation'
  | 'Variance'
  | 'OpeningBalance'
  | 'Transfer';

export interface StockMovement {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  productId: string;
  tankId: string | null;
  movementType: MovementType | string;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface StockMovementRepository {
  save(movement: StockMovement): Promise<void>;
  saveMany(movements: StockMovement[]): Promise<void>;
  /** Book quantity in a tank = Σ movement quantities for that tank. */
  currentQuantityForTank(tankId: string): Promise<number>;
  /** Book quantity for an item product = Σ movement quantities for that product. */
  currentQuantityForProduct(organizationId: string, productId: string): Promise<number>;
}

export interface StockVariance {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  productId: string;
  tankId: string | null;
  expectedQuantity: string;
  actualQuantity: string;
  varianceQuantity: string;
  reason: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface StockVarianceRepository {
  save(variance: StockVariance): Promise<void>;
}
