import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { Product, ProductRepository } from '@pump/core';

type Row = typeof schema.products.$inferSelect;

function toEntity(row: Row): Product {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    productType: row.productType as Product['productType'],
    inventoryType: row.inventoryType as Product['inventoryType'],
    stockTracked: row.stockTracked,
    isTaxable: row.isTaxable,
    taxCategory: (row.taxCategory ?? 'GST') as Product['taxCategory'],
    unit: row.unit,
    brand: row.brand ?? null,
    category: row.category ?? null,
    sellingPrice: row.sellingPrice ?? null,
    taxConfig: (row.taxConfig ?? {}) as Product['taxConfig'],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async save(p: Product): Promise<void> {
    await this.db
      .insert(schema.products)
      .values({
        id: p.id,
        organizationId: p.organizationId,
        name: p.name,
        code: p.code,
        productType: p.productType,
        inventoryType: p.inventoryType,
        stockTracked: p.stockTracked,
        isTaxable: p.isTaxable,
        taxCategory: p.taxCategory,
        unit: p.unit,
        brand: p.brand,
        category: p.category,
        sellingPrice: p.sellingPrice,
        taxConfig: p.taxConfig,
        isActive: p.isActive,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.products.id,
        set: {
          name: p.name,
          code: p.code,
          productType: p.productType,
          inventoryType: p.inventoryType,
          stockTracked: p.stockTracked,
          isTaxable: p.isTaxable,
          taxCategory: p.taxCategory,
          unit: p.unit,
          brand: p.brand,
          category: p.category,
          sellingPrice: p.sellingPrice,
          taxConfig: p.taxConfig,
          isActive: p.isActive,
          updatedAt: new Date(p.updatedAt),
        },
      });
  }

  async existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(and(eq(schema.products.organizationId, organizationId), eq(schema.products.code, code)));
    return rows.some((r) => r.id !== excludeId);
  }

  async listByOrganization(organizationId: string): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.organizationId, organizationId));
    return rows.map(toEntity);
  }
}
