import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  OrganizationProfileRepository,
  OrganizationProfileWrite,
  OrganizationRecord,
} from '@pump/core';

/**
 * The Organization's profile columns (#634). `findById` locks the row so two
 * concurrent saves diff against the state each one actually overwrites.
 */
export class DrizzleOrganizationProfileRepository implements OrganizationProfileRepository {
  constructor(private readonly tx: DbClient) {}

  async findById(organizationId: string): Promise<OrganizationRecord | null> {
    const [row] = await this.tx
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .for('update');
    return row ?? null;
  }

  async updateProfile(
    organizationId: string,
    write: OrganizationProfileWrite,
  ): Promise<OrganizationRecord> {
    const [row] = await this.tx
      .update(schema.organizations)
      .set({ name: write.name, metadata: write.metadata, updatedAt: new Date(write.updatedAt) })
      .where(eq(schema.organizations.id, organizationId))
      .returning();
    if (!row) throw new Error(`Organization ${organizationId} vanished during a profile update`);
    return row;
  }
}
