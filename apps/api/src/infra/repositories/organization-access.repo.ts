import { count, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { OrganizationAccessInputs, OrganizationAccessReader } from '@pump/core';

/**
 * Loads the Organization's access inputs in one pass: subscription fields,
 * active Entitlement grants, active Limit overrides, and Limit usage.
 *
 * Phase E1 ships no grant or override tables yet (#163), so those resolve to
 * empty — every Organization gets exactly what its Product Plan supplies.
 * Station usage is counted live from `stations`: every row consumes capacity,
 * including inactive and partially onboarded Stations.
 */
export class DrizzleOrganizationAccessReader implements OrganizationAccessReader {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string): Promise<OrganizationAccessInputs> {
    const [organization] = await this.db
      .select({
        subscriptionPlan: schema.organizations.subscriptionPlan,
        subscriptionStatus: schema.organizations.subscriptionStatus,
        accessUntil: schema.organizations.accessUntil,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));

    const [stations] = await this.db
      .select({ value: count() })
      .from(schema.stations)
      .where(eq(schema.stations.organizationId, organizationId));

    return {
      plan: organization?.subscriptionPlan ?? null,
      subscriptionStatus: organization?.subscriptionStatus ?? null,
      accessUntil: organization?.accessUntil?.toISOString() ?? null,
      grantedCapabilities: [],
      limitOverrides: {},
      usage: { station_count: Number(stations?.value ?? 0) },
    };
  }
}
