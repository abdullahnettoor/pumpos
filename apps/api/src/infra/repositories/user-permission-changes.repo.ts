import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { UserPermissionChangesWriter } from '@pump/core';
import type { PermissionChanges } from '@pump/shared';

function toIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Reads and writes a user's stored Permission differences (table `user_permission_changes`). */
export class DrizzleUserPermissionChangesRepository implements UserPermissionChangesWriter {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string, userId: string): Promise<PermissionChanges | null> {
    const [row] = await this.db
      .select({
        granted: schema.userPermissionChanges.granted,
        revoked: schema.userPermissionChanges.revoked,
      })
      .from(schema.userPermissionChanges)
      .where(
        and(
          eq(schema.userPermissionChanges.organizationId, organizationId),
          eq(schema.userPermissionChanges.userId, userId),
        ),
      );
    if (!row) return null;
    return { granted: toIds(row.granted), revoked: toIds(row.revoked) };
  }

  async save(input: Parameters<UserPermissionChangesWriter['save']>[0]): Promise<void> {
    const at = new Date(input.at);
    await this.db
      .insert(schema.userPermissionChanges)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        userId: input.userId,
        granted: input.changes.granted,
        revoked: input.changes.revoked,
        updatedByUserId: input.updatedByUserId,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: schema.userPermissionChanges.userId,
        setWhere: eq(schema.userPermissionChanges.organizationId, input.organizationId),
        set: {
          granted: input.changes.granted,
          revoked: input.changes.revoked,
          updatedByUserId: input.updatedByUserId,
          updatedAt: at,
        },
      });
  }

  async clear(organizationId: string, userId: string): Promise<void> {
    await this.db
      .delete(schema.userPermissionChanges)
      .where(
        and(
          eq(schema.userPermissionChanges.organizationId, organizationId),
          eq(schema.userPermissionChanges.userId, userId),
        ),
      );
  }
}
