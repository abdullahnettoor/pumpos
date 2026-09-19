import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  CapabilityGrant,
  LimitOverride,
  OrganizationAccessAdminRepository,
  OrganizationAccessInputs,
  OrganizationAccessReader,
  PlatformActor,
  StationCapacityPort,
} from '@pump/core';
import { isLimitKey } from '@pump/core';
import type { LimitKey } from '@pump/shared';

type GrantRow = typeof schema.organizationCapabilityGrants.$inferSelect;
type OverrideRow = typeof schema.organizationLimitOverrides.$inferSelect;

function toGrant(row: GrantRow): CapabilityGrant {
  return {
    id: row.id,
    organizationId: row.organizationId,
    capabilityKey: row.capabilityKey,
    grantedByEmail: row.grantedByEmail,
    grantedBySubject: row.grantedBySubject ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedByEmail: row.revokedByEmail ?? null,
    revokedBySubject: row.revokedBySubject ?? null,
  };
}

function toOverride(row: OverrideRow): LimitOverride {
  return {
    id: row.id,
    organizationId: row.organizationId,
    limitKey: row.limitKey as LimitKey,
    value: row.value,
    assignedByEmail: row.assignedByEmail,
    assignedBySubject: row.assignedBySubject ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedByEmail: row.revokedByEmail ?? null,
    revokedBySubject: row.revokedBySubject ?? null,
  };
}

/**
 * Loads the Organization's access inputs in one pass: subscription fields,
 * active Entitlement grants, active Limit overrides, and Limit usage.
 *
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

    const grants = await this.db
      .select({ capabilityKey: schema.organizationCapabilityGrants.capabilityKey })
      .from(schema.organizationCapabilityGrants)
      .where(
        and(
          eq(schema.organizationCapabilityGrants.organizationId, organizationId),
          isNull(schema.organizationCapabilityGrants.revokedAt),
        ),
      );

    const overrides = await this.db
      .select({
        limitKey: schema.organizationLimitOverrides.limitKey,
        value: schema.organizationLimitOverrides.value,
      })
      .from(schema.organizationLimitOverrides)
      .where(
        and(
          eq(schema.organizationLimitOverrides.organizationId, organizationId),
          isNull(schema.organizationLimitOverrides.revokedAt),
        ),
      );

    const limitOverrides: Partial<Record<LimitKey, number>> = {};
    for (const override of overrides) {
      // A stored key this build no longer enforces is ignored rather than
      // guessed at; the Product Plan value stands.
      if (isLimitKey(override.limitKey)) limitOverrides[override.limitKey] = override.value;
    }

    return {
      plan: organization?.subscriptionPlan ?? null,
      subscriptionStatus: organization?.subscriptionStatus ?? null,
      accessUntil: organization?.accessUntil?.toISOString() ?? null,
      grantedCapabilities: grants.map((grant) => grant.capabilityKey),
      limitOverrides,
      usage: { station_count: Number(stations?.value ?? 0) },
    };
  }
}

/**
 * Capacity guard for Station onboarding. The Organization row is locked for
 * the rest of the transaction, so concurrent onboarding requests queue behind
 * each other instead of both reading stale usage.
 */
export class DrizzleStationCapacityPort implements StationCapacityPort {
  private readonly reader: DrizzleOrganizationAccessReader;

  constructor(private readonly tx: DbClient) {
    this.reader = new DrizzleOrganizationAccessReader(tx);
  }

  async lockOrganization(organizationId: string): Promise<void> {
    await this.tx.execute(
      sql`select id from organizations where id = ${organizationId} for update`,
    );
  }

  load(organizationId: string): Promise<OrganizationAccessInputs> {
    return this.reader.load(organizationId);
  }
}

/** Append-only store for Entitlement and Limit history. */
export class DrizzleOrganizationAccessAdminRepository implements OrganizationAccessAdminRepository {
  constructor(private readonly tx: DbClient) {}

  async findActiveGrant(
    organizationId: string,
    capabilityKey: string,
  ): Promise<CapabilityGrant | null> {
    const [row] = await this.tx
      .select()
      .from(schema.organizationCapabilityGrants)
      .where(
        and(
          eq(schema.organizationCapabilityGrants.organizationId, organizationId),
          eq(schema.organizationCapabilityGrants.capabilityKey, capabilityKey),
          isNull(schema.organizationCapabilityGrants.revokedAt),
        ),
      );
    return row ? toGrant(row) : null;
  }

  async listGrants(organizationId: string): Promise<CapabilityGrant[]> {
    const rows = await this.tx
      .select()
      .from(schema.organizationCapabilityGrants)
      .where(eq(schema.organizationCapabilityGrants.organizationId, organizationId))
      .orderBy(desc(schema.organizationCapabilityGrants.createdAt));
    return rows.map(toGrant);
  }

  async insertGrant(input: {
    organizationId: string;
    capabilityKey: string;
    actor: PlatformActor;
    reason: string | null;
  }): Promise<CapabilityGrant> {
    const [row] = await this.tx
      .insert(schema.organizationCapabilityGrants)
      .values({
        organizationId: input.organizationId,
        capabilityKey: input.capabilityKey,
        grantedByEmail: input.actor.email,
        grantedBySubject: input.actor.subjectId,
        reason: input.reason,
      })
      .returning();
    return toGrant(row);
  }

  async revokeGrant(id: string, actor: PlatformActor): Promise<CapabilityGrant> {
    const [row] = await this.tx
      .update(schema.organizationCapabilityGrants)
      .set({
        revokedAt: new Date(),
        revokedByEmail: actor.email,
        revokedBySubject: actor.subjectId,
      })
      .where(eq(schema.organizationCapabilityGrants.id, id))
      .returning();
    return toGrant(row);
  }

  async findActiveOverride(
    organizationId: string,
    limitKey: LimitKey,
  ): Promise<LimitOverride | null> {
    const [row] = await this.tx
      .select()
      .from(schema.organizationLimitOverrides)
      .where(
        and(
          eq(schema.organizationLimitOverrides.organizationId, organizationId),
          eq(schema.organizationLimitOverrides.limitKey, limitKey),
          isNull(schema.organizationLimitOverrides.revokedAt),
        ),
      );
    return row ? toOverride(row) : null;
  }

  async listOverrides(organizationId: string): Promise<LimitOverride[]> {
    const rows = await this.tx
      .select()
      .from(schema.organizationLimitOverrides)
      .where(eq(schema.organizationLimitOverrides.organizationId, organizationId))
      .orderBy(desc(schema.organizationLimitOverrides.createdAt));
    return rows.map(toOverride);
  }

  async insertOverride(input: {
    organizationId: string;
    limitKey: LimitKey;
    value: number;
    actor: PlatformActor;
    reason: string;
  }): Promise<LimitOverride> {
    const [row] = await this.tx
      .insert(schema.organizationLimitOverrides)
      .values({
        organizationId: input.organizationId,
        limitKey: input.limitKey,
        value: input.value,
        assignedByEmail: input.actor.email,
        assignedBySubject: input.actor.subjectId,
        reason: input.reason,
      })
      .returning();
    return toOverride(row);
  }

  async revokeOverride(id: string, actor: PlatformActor): Promise<LimitOverride> {
    const [row] = await this.tx
      .update(schema.organizationLimitOverrides)
      .set({
        revokedAt: new Date(),
        revokedByEmail: actor.email,
        revokedBySubject: actor.subjectId,
      })
      .where(eq(schema.organizationLimitOverrides.id, id))
      .returning();
    return toOverride(row);
  }
}
