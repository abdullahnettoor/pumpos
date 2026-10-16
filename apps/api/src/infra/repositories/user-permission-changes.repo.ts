import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { UserPermissionChangesReader } from '@pump/core';
import type { PermissionChanges } from '@pump/shared';

function toIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Reads a user's stored Permission differences (table `user_permission_changes`). */
export class DrizzleUserPermissionChangesReader implements UserPermissionChangesReader {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string, userId: string): Promise<PermissionChanges | null> {
    const [row] = await this.db
      .select({
        organizationId: schema.userPermissionChanges.organizationId,
        granted: schema.userPermissionChanges.granted,
        revoked: schema.userPermissionChanges.revoked,
      })
      .from(schema.userPermissionChanges)
      .where(eq(schema.userPermissionChanges.userId, userId));
    if (!row || row.organizationId !== organizationId) return null;
    return { granted: toIds(row.granted), revoked: toIds(row.revoked) };
  }
}
