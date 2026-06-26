import { schema, type DbClient } from '@pump/db';
import type { Purchase, PurchaseRepository, SupplierTransaction, SupplierTransactionRepository } from '@pump/core';

export class DrizzlePurchaseRepository implements PurchaseRepository {
  constructor(private readonly db: DbClient) {}
  async save(p: Purchase): Promise<void> {
    await this.db.insert(schema.purchases).values({
      id: p.id,
      documentNumber: p.documentNumber,
      shiftId: p.shiftId,
      businessDayId: p.businessDayId,
      supplierId: p.supplierId,
      invoiceNumber: p.invoiceNumber,
      amount: p.amount,
      notes: p.notes,
      createdAt: new Date(p.createdAt),
    });
  }
}

export class DrizzleSupplierTransactionRepository implements SupplierTransactionRepository {
  constructor(private readonly db: DbClient) {}
  async save(t: SupplierTransaction): Promise<void> {
    await this.db.insert(schema.supplierTransactions).values({
      id: t.id,
      shiftId: t.shiftId,
      businessDayId: t.businessDayId,
      supplierId: t.supplierId,
      transactionType: t.transactionType,
      amount: t.amount,
      paidFrom: t.paidFrom,
      affectsDrawer: t.affectsDrawer,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      notes: t.notes,
      createdAt: new Date(t.createdAt),
    });
  }
}
