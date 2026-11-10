import { and, eq } from 'drizzle-orm';
import { schema, type DbExecutor } from '@pump/db';
import type { PurchaseStationLegalReader } from '@pump/core';

/** Invoice bill-to lookup: never read another Organization's Customer first. */
export async function readInvoiceCustomer(
  db: DbExecutor,
  organizationId: string,
  customerId: string,
) {
  const [row] = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      metadata: schema.customers.metadata,
    })
    .from(schema.customers)
    .where(
      and(eq(schema.customers.id, customerId), eq(schema.customers.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

/** Only legal/settings data needed by invoices and purchase place-of-supply. */
export async function readStationLegal(db: DbExecutor, organizationId: string, stationId: string) {
  const [row] = await db
    .select({ settings: schema.stations.settings })
    .from(schema.stations)
    .where(
      and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

export class DrizzlePurchaseStationLegalReader implements PurchaseStationLegalReader {
  constructor(private readonly db: DbExecutor) {}
  async findStateCode(organizationId: string, stationId: string) {
    const station = await readStationLegal(this.db, organizationId, stationId);
    if (!station) return null;
    const legal = (station.settings as { legal?: { stateCode?: unknown } } | null)?.legal;
    return { stateCode: typeof legal?.stateCode === 'string' ? legal.stateCode : null };
  }
}
