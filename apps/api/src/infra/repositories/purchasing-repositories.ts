import { schema, type DbClient } from '@pump/db';
import type { Purchase, PurchaseItem, PurchaseItemRepository, PurchaseRepository, SupplierTransaction, SupplierTransactionRepository } from '@pump/core';

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
      taxableAmount: p.taxableAmount,
      cgstTotal: p.cgstTotal,
      sgstTotal: p.sgstTotal,
      igstTotal: p.igstTotal,
      vatTotal: p.vatTotal,
      cessTotal: p.cessTotal,
      notes: p.notes,
      createdAt: new Date(p.createdAt),
    });
  }
}

export class DrizzlePurchaseItemRepository implements PurchaseItemRepository {
  constructor(private readonly db: DbClient) {}
  async saveMany(items: PurchaseItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.db.insert(schema.purchaseItems).values(
      items.map((it) => ({
        id: it.id,
        purchaseId: it.purchaseId,
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        taxCategory: it.taxCategory,
        gstRate: it.gstRate,
        vatRate: it.vatRate,
        cessRate: it.cessRate,
        hsnCode: it.hsnCode,
        taxableAmount: it.taxableAmount,
        cgst: it.cgst,
        sgst: it.sgst,
        igst: it.igst,
        vat: it.vat,
        cess: it.cess,
        lineTotal: it.lineTotal,
        tankAllocations: it.tankAllocations,
        createdAt: new Date(it.createdAt),
      })),
    );
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
