import { schema, type DbClient } from '@pump/db';
import type {
  Purchase,
  PurchaseItem,
  PurchaseItemRepository,
  PurchaseRepository,
  SupplierTransaction,
  SupplierTransactionRepository,
} from '@pump/core';
import { accountTypeForPaidFrom } from '@pump/core';
import { resolveOfficeColumns } from '../office-anchor.js';

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
    // TODO(#273): derive the new not-null office columns from the legacy anchor;
    // the legacy shift/business-day/paid-from is stashed in metadata (ADR 0005, #280).
    const cols = await resolveOfficeColumns(
      this.db,
      t.businessDayId,
      accountTypeForPaidFrom(t.paidFrom),
    );
    await this.db.insert(schema.supplierTransactions).values({
      id: t.id,
      organizationId: cols.organizationId,
      stationId: cols.stationId,
      entryDate: cols.entryDate,
      fundingAccountId: cols.fundingAccountId,
      supplierId: t.supplierId,
      transactionType: t.transactionType,
      amount: t.amount,
      affectsDrawer: t.affectsDrawer,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      notes: t.notes,
      metadata: {
        ...(t.metadata ?? {}),
        shiftId: t.shiftId,
        businessDayId: t.businessDayId,
        paidFrom: t.paidFrom,
      },
      createdAt: new Date(t.createdAt),
    });
  }
}
