import { and, eq } from 'drizzle-orm';
import { schema, type DbExecutor } from '@pump/db';
import type { TenantReferenceKind, TenantReferenceReader } from '@pump/core';

/** Scoped reads for operational writes; deliberately independent of setup ports. */
export class DrizzleTenantReferenceReader implements TenantReferenceReader {
  constructor(private readonly db: DbExecutor) {}

  async exists(
    organizationId: string,
    kind: TenantReferenceKind,
    id: string,
    scope?: { stationId?: string; customerId?: string | null; productId?: string },
  ): Promise<boolean> {
    const table = {
      Product: schema.products,
      Tank: schema.tanks,
      Vehicle: schema.customerVehicles,
      Attendant: schema.users,
      Dispenser: schema.dispenserUnits,
      'Expense head': schema.expenseCategories,
      'Income head': schema.incomeCategories,
    }[kind];
    const conditions = [eq(table.id, id), eq(table.organizationId, organizationId)];
    if (kind === 'Tank') {
      if (scope?.stationId) conditions.push(eq(schema.tanks.stationId, scope.stationId));
      if (scope?.productId) conditions.push(eq(schema.tanks.productId, scope.productId));
    }
    if (kind === 'Dispenser' && scope?.stationId)
      conditions.push(eq(schema.dispenserUnits.stationId, scope.stationId));
    if (kind === 'Vehicle' && scope?.customerId)
      conditions.push(eq(schema.customerVehicles.customerId, scope.customerId));
    const rows = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(...conditions))
      .limit(1);
    return rows.length === 1;
  }
}
