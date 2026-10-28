import {
  CUSTOM_PERMISSIONS_CAPABILITY,
  hasFixedPermissions,
  resolveEffectivePermissions,
} from '@pump/shared';
import type { PermissionId } from '@pump/shared';
import type { OrganizationAccessReader, UserPermissionChangesReader } from './ports.js';
import { resolveEffectiveCapabilities } from './resolve-access.js';
import type { AccessRegistry } from './registry.js';

export interface ResolveUserPermissionsDeps {
  access: OrganizationAccessReader;
  changes: UserPermissionChangesReader;
  registry?: AccessRegistry;
}

/**
 * The user's effective Permissions for this request (ADR 0013): Role defaults
 * plus stored changes when the Organization has "Custom permissions". Reads
 * only what it needs: a fixed Role, or a user with no stored changes, never
 * touches the Organization's access inputs. Reused by the Owner's editor
 * (#553) so what the Owner previews is what the server enforces.
 */
export async function resolveUserPermissions(
  deps: ResolveUserPermissionsDeps,
  input: { organizationId: string; userId: string; role: string },
): Promise<Set<PermissionId>> {
  if (hasFixedPermissions(input.role)) {
    return resolveEffectivePermissions({ role: input.role, entitled: false });
  }
  const changes = await deps.changes.load(input.organizationId, input.userId);
  if (!changes || ((changes.granted?.length ?? 0) === 0 && (changes.revoked?.length ?? 0) === 0)) {
    return resolveEffectivePermissions({ role: input.role, entitled: false });
  }
  const inputs = await deps.access.load(input.organizationId);
  const entitled = resolveEffectiveCapabilities(inputs, deps.registry).has(
    CUSTOM_PERMISSIONS_CAPABILITY,
  );
  return resolveEffectivePermissions({ role: input.role, changes, entitled });
}
