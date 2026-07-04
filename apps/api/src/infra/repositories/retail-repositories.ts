import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { Sale, SaleLine, SaleRepository, MerchandiseHandoverRepository } from '@pump/core';

export class DrizzleSaleRepository implements SaleRepository {
  constructor(private readonly db: DbClient) {}

  async save(sale: Sale, lines: SaleLine[]): Promise<void> {
    await this.db.insert(schema.sales).values({
      id: sale.id,
      documentNumber: sale.documentNumber,
      shiftId: sale.shiftId,
      businessDayId: sale.businessDayId,
      saleType: sale.saleType,
      captureMechanism: sale.captureMechanism,
      paymentMethod: sale.paymentMethod,
      customerId: sale.customerId,
      vehicleId: sale.vehicleId,
      attendantId: sale.attendantId,
      subtotalAmount: sale.subtotalAmount,
      taxAmount: sale.taxAmount,
      totalAmount: sale.totalAmount,
      nonCashAmount: sale.nonCashAmount ?? '0',
      notes: sale.notes,
      createdAt: new Date(sale.createdAt),
      updatedAt: new Date(sale.updatedAt),
    });
    if (lines.length > 0) {
      await this.db.insert(schema.saleItems).values(
        lines.map((l) => ({
          id: l.id,
          saleId: l.saleId,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          createdAt: new Date(l.createdAt),
        })),
      );
    }
  }
}

export class DrizzleMerchandiseHandoverRepository implements MerchandiseHandoverRepository {
  constructor(private readonly db: DbClient) {}

  async findHandoverSaleId(shiftId: string, attendantId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: schema.sales.id })
      .from(schema.sales)
      .where(
        and(
          eq(schema.sales.shiftId, shiftId),
          eq(schema.sales.attendantId, attendantId),
          eq(schema.sales.captureMechanism, 'MERCH_HANDOVER'),
        ),
      )
      .limit(1);
    return rows.length ? rows[0].id : null;
  }

  async deleteHandoverSale(saleId: string): Promise<void> {
    // Remove the sale's stock movements and line items before the sale itself.
    await this.db
      .delete(schema.stockMovements)
      .where(and(eq(schema.stockMovements.referenceType, 'SALE'), eq(schema.stockMovements.referenceId, saleId)));
    await this.db.delete(schema.saleItems).where(eq(schema.saleItems.saleId, saleId));
    await this.db.delete(schema.sales).where(eq(schema.sales.id, saleId));
  }
}
