import type { PermissionId, Role } from '@pump/shared';

/** Authenticated tenant identity shared by the API middleware and routers. */
export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  fullName: string | null;
  organizationId: string;
  role: Role;
  assignedStationIds: string[];
  /**
   * Effective Permissions (Role defaults + the user's changes when the
   * Organization is entitled), resolved once per auth-cache fill. `can()`
   * reads this; absent only in tests, where it falls back to Role defaults.
   */
  permissions?: ReadonlySet<PermissionId>;
}
