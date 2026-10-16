/**
 * The signed-in user's effective Permissions, as the clients see them (ADR 0013).
 *
 * The Access Document carries the effective set (Role defaults plus the user's
 * changes). `useEffectivePrincipal` — called once at each app root — reads it
 * and publishes it here; every screen then asks `principalFor(role)`, which
 * answers with that set, or with the Role defaults while the document is
 * loading or absent (never more than the Role would give). Presentation only:
 * the API re-checks every write against the same set.
 *
 * Because the root re-renders whenever the document changes (refetch on window
 * focus and every minute), the whole tree re-reads the new set without a reload.
 */
import { principalOf, type PermissionId, type Principal } from '@pump/shared';
import type { AccessDocument } from '@pump/shared';
import { useMemo } from 'react';
import { useAccess } from '../query/hooks.js';

interface Effective {
  role: string;
  permissions: ReadonlySet<PermissionId>;
}

let effective: Effective | null = null;

/** Pure: the Principal for a Role given the (possibly absent) document. */
export function principalFromAccess(
  role: string | null | undefined,
  access: Pick<AccessDocument, 'permissions'> | undefined,
): Principal {
  const base = principalOf(role);
  if (!role || !access?.permissions) return base;
  return { role: base.role, permissions: new Set(access.permissions as PermissionId[]) };
}

/** The Principal every UI permission check should use. */
export function principalFor(role: string | null | undefined): Principal {
  if (role && effective && effective.role === role) {
    return { role: principalOf(role).role, permissions: effective.permissions };
  }
  return principalOf(role);
}

export function publishEffective(role: string | null | undefined, permissions: string[] | undefined) {
  effective =
    role && permissions ? { role, permissions: new Set(permissions as PermissionId[]) } : null;
}

/** Test seam: forget the published set. */
export function resetEffectivePrincipal(): void {
  effective = null;
}

/**
 * Subscribe this component (an app root) to the Access Document and publish the
 * effective Permissions. Returns the Principal, and re-renders the root when the
 * set changes. Refreshes on focus and every minute (`useAccess`).
 */
export function useEffectivePrincipal(role: string | null | undefined): Principal {
  const { data } = useAccess({ enabled: !!role });
  const principal = useMemo(() => principalFromAccess(role, data), [role, data]);
  // Published during render so children rendered by this root read the new set
  // in the same pass; idempotent for a given (role, document).
  publishEffective(role, data?.permissions);
  return principal;
}

/**
 * The signed-in user's published Principal, for components that do not know the
 * Role (nobody before the Access Document loads, so figures stay hidden until
 * the server has answered).
 */
export function currentPrincipal(): Principal {
  return effective
    ? { role: principalOf(effective.role).role, permissions: effective.permissions }
    : principalOf(null);
}
