import { and, eq, isNotNull, ne } from 'drizzle-orm';
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
    costBasis: row.costBasis ?? null,
    taxConfig: row.taxConfig ?? {},
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string, organizationId: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.id, id), eq(schema.products.organizationId, organizationId)))
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
        costBasis: p.costBasis ?? '0',
        taxConfig: p.taxConfig,
        isActive: p.isActive,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.products.id,
        setWhere: eq(schema.products.organizationId, p.organizationId),
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
      .where(
        and(eq(schema.products.organizationId, organizationId), eq(schema.products.code, code)),
      );
    return rows.some((r) => r.id !== excludeId);
  }

  async listByOrganization(organizationId: string): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(schema.products)
      .where(eq(schema.products.organizationId, organizationId));
    return rows.map(toEntity);
  }

  async listCategories(organizationId: string, excludeProductId?: string): Promise<string[]> {
    const conditions = [
      eq(schema.products.organizationId, organizationId),
      isNotNull(schema.products.category),
    ];
    if (excludeProductId) {
      conditions.push(ne(schema.products.id, excludeProductId));
    }
    const rows = await this.db
      .selectDistinct({ category: schema.products.category })
      .from(schema.products)
      .where(and(...conditions))
      .orderBy(schema.products.category);
    return rows
      .map((r) => r.category)
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  }

  async updateCostBasis(
    productId: string,
    costBasis: string,
    organizationId: string,
  ): Promise<void> {
    await this.db
      .update(schema.products)
      .set({ costBasis, updatedAt: new Date() })
      .where(
        and(eq(schema.products.id, productId), eq(schema.products.organizationId, organizationId)),
      );
  }
}
