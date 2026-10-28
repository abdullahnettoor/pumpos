import { and, desc, eq, exists, inArray, lte, or } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';

/**
 * The one order of a station's fuel prices, latest first (#537 review):
 * effective time, then when it was recorded, then id. Two prices effective at
 * the same moment always resolve the same way, so the price Pricing shows as
 * current is the price shift close sells at. The client orders the same way
 * with `compareFuelPricesNewestFirst` (@pump/shared); change both together.
 */
export const fuelPricesNewestFirst = () => [
  desc(schema.fuelPrices.effectiveFrom),
  desc(schema.fuelPrices.createdAt),
  desc(schema.fuelPrices.id),
];

/**
 * Every active fuel of the organization with its current price at the station
 * (0 / null before the first): the latest price in effect at `now`. A price
 * scheduled for later is stored but not current until its time (#619); the
 * history lists it.
 *
 * Also every product sold on a nozzle of a dispenser in service here, even
 * archived (#633 review): `OpenShift` prices those nozzles whatever the
 * product's status, and the Open shift form checks the same set from this
 * list. Leaving an archived fuel out made the form block an open the server
 * accepts.
 */
export async function listCurrentFuelPrices(
  db: DbClient,
  organizationId: string,
  stationId: string,
  now: Date = new Date(),
) {
  const fuels = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.organizationId, organizationId),
        or(
          and(eq(schema.products.productType, 'FUEL'), eq(schema.products.isActive, true)),
          exists(
            db
              .select({ id: schema.nozzles.id })
              .from(schema.nozzles)
              .innerJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.nozzles.duId))
              .where(
                and(
                  eq(schema.nozzles.productId, schema.products.id),
                  eq(schema.nozzles.organizationId, organizationId),
                  eq(schema.nozzles.stationId, stationId),
                  eq(schema.dispenserUnits.status, 'ACTIVE'),
                ),
              ),
          ),
        ),
      ),
    );

  const fuelIds = fuels.map((f) => f.id);
  const allPrices =
    fuelIds.length > 0
      ? await db
          .select()
          .from(schema.fuelPrices)
          .where(
            and(
              eq(schema.fuelPrices.organizationId, organizationId),
              eq(schema.fuelPrices.stationId, stationId),
              inArray(schema.fuelPrices.productId, fuelIds),
              lte(schema.fuelPrices.effectiveFrom, now),
            ),
          )
          .orderBy(...fuelPricesNewestFirst())
      : [];

  const latestByProduct = new Map<string, (typeof allPrices)[number]>();
  for (const p of allPrices) {
    if (!latestByProduct.has(p.productId)) latestByProduct.set(p.productId, p);
  }

  return fuels.map((f) => {
    const latestPrice = latestByProduct.get(f.id);
    return {
      productId: f.id,
      productName: f.name,
      productCode: f.code,
      price: latestPrice ? Number(latestPrice.price) : 0,
      effectiveFrom: latestPrice ? latestPrice.effectiveFrom : null,
    };
  });
}

/** The station's price changes, latest first. */
export async function listFuelPriceHistory(
  db: DbClient,
  organizationId: string,
  stationId: string,
) {
  return db
    .select({
      id: schema.fuelPrices.id,
      productId: schema.fuelPrices.productId,
      productName: schema.products.name,
      productCode: schema.products.code,
      price: schema.fuelPrices.price,
      effectiveFrom: schema.fuelPrices.effectiveFrom,
      createdAt: schema.fuelPrices.createdAt,
    })
    .from(schema.fuelPrices)
    .innerJoin(schema.products, eq(schema.fuelPrices.productId, schema.products.id))
    .where(
      and(
        eq(schema.fuelPrices.stationId, stationId),
        eq(schema.fuelPrices.organizationId, organizationId),
      ),
    )
    .orderBy(...fuelPricesNewestFirst());
}
