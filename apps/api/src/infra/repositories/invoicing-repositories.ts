import { eq, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { Invoice, InvoiceRepository, DocumentSequenceRepository } from '@pump/core';

function mapRow(r: typeof schema.invoices.$inferSelect): Invoice {
  return {
    id: r.id,
    organizationId: r.organizationId,
    stationId: r.stationId,
    saleId: r.saleId,
    invoiceNumber: r.invoiceNumber,
    financialYear: r.financialYear,
    issuedDate: r.issuedDate,
    buyerCustomerId: r.buyerCustomerId,
    buyerName: r.buyerName,
    buyerGstin: r.buyerGstin,
    buyerStateCode: r.buyerStateCode,
    interState: r.interState,
    taxableAmount: r.taxableAmount,
    cgstTotal: r.cgstTotal,
    sgstTotal: r.sgstTotal,
    igstTotal: r.igstTotal,
    vatTotal: r.vatTotal,
    cessTotal: r.cessTotal,
    roundOff: r.roundOff,
    totalAmount: r.totalAmount,
    snapshotData: r.snapshotData as Invoice['snapshotData'],
    createdAt: (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)),
  };
}

export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: DbClient) {}

  async findBySaleId(saleId: string): Promise<Invoice | null> {
    const rows = await this.db.select().from(schema.invoices).where(eq(schema.invoices.saleId, saleId)).limit(1);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async save(inv: Invoice): Promise<void> {
    await this.db.insert(schema.invoices).values({
      id: inv.id,
      organizationId: inv.organizationId,
      stationId: inv.stationId,
      saleId: inv.saleId,
      invoiceNumber: inv.invoiceNumber,
      financialYear: inv.financialYear,
      issuedDate: inv.issuedDate,
      buyerCustomerId: inv.buyerCustomerId,
      buyerName: inv.buyerName,
      buyerGstin: inv.buyerGstin,
      buyerStateCode: inv.buyerStateCode,
      interState: inv.interState,
      taxableAmount: inv.taxableAmount,
      cgstTotal: inv.cgstTotal,
      sgstTotal: inv.sgstTotal,
      igstTotal: inv.igstTotal,
      vatTotal: inv.vatTotal,
      cessTotal: inv.cessTotal,
      roundOff: inv.roundOff,
      totalAmount: inv.totalAmount,
      snapshotData: inv.snapshotData as Record<string, unknown>,
      createdAt: new Date(inv.createdAt),
    });
  }
}

export class DrizzleDocumentSequenceRepository implements DocumentSequenceRepository {
  constructor(private readonly db: DbClient) {}

  /** Atomic gapless increment via upsert (safe within the request transaction). */
  async nextNumber(organizationId: string, docType: string, scope: string, financialYear: string): Promise<number> {
    const rows = await this.db
      .insert(schema.documentSequences)
      .values({ organizationId, docType, scope, financialYear, lastNumber: 1 })
      .onConflictDoUpdate({
        target: [
          schema.documentSequences.organizationId,
          schema.documentSequences.docType,
          schema.documentSequences.scope,
          schema.documentSequences.financialYear,
        ],
        set: { lastNumber: sql`${schema.documentSequences.lastNumber} + 1` },
      })
      .returning({ lastNumber: schema.documentSequences.lastNumber });
    return rows[0].lastNumber;
  }
}
