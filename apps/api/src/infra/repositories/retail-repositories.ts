import { schema, type DbClient } from '@pump/db';
import type { Sale, SaleLine, SaleRepository } from '@pump/core';

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
      subtotalAmount: sale.subtotalAmount,
      taxAmount: sale.taxAmount,
      totalAmount: sale.totalAmount,
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
