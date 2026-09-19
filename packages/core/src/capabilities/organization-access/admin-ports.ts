import type { LimitKey } from '@pump/shared';

/**
 * Platform-side view of one Entitlement grant. Actor fields are snapshots of
 * the PumpOS platform administrator, never tenant User references.
 */
export interface CapabilityGrant {
  id: string;
  organizationId: string;
  capabilityKey: string;
  grantedByEmail: string;
  grantedBySubject: string | null;
  reason: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
  revokedBySubject: string | null;
}

/** Platform-side view of one Limit override. */
export interface LimitOverride {
  id: string;
  organizationId: string;
  limitKey: LimitKey;
  value: number;
  assignedByEmail: string;
  assignedBySubject: string | null;
  reason: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
  revokedBySubject: string | null;
}

/** Who performed a platform access change, recorded on the row and its event. */
export interface PlatformActor {
  email: string;
  subjectId: string | null;
}

/**
 * Append-only store for Entitlement and Limit history. Revocation closes the
 * active row; a regrant inserts a new one. Implementations must enforce at
 * most one active row per Organization and key.
 */
export interface OrganizationAccessAdminRepository {
  findActiveGrant(organizationId: string, capabilityKey: string): Promise<CapabilityGrant | null>;
  listGrants(organizationId: string): Promise<CapabilityGrant[]>;
  insertGrant(input: {
    organizationId: string;
    capabilityKey: string;
    actor: PlatformActor;
    reason: string | null;
  }): Promise<CapabilityGrant>;
  revokeGrant(id: string, actor: PlatformActor): Promise<CapabilityGrant>;

  findActiveOverride(organizationId: string, limitKey: LimitKey): Promise<LimitOverride | null>;
  listOverrides(organizationId: string): Promise<LimitOverride[]>;
  insertOverride(input: {
    organizationId: string;
    limitKey: LimitKey;
    value: number;
    actor: PlatformActor;
    reason: string;
  }): Promise<LimitOverride>;
  revokeOverride(id: string, actor: PlatformActor): Promise<LimitOverride>;
}

/**
 * Outcome of a platform access command. `changed: false` means the request
 * was already satisfied: no row was written and no event was emitted, so
 * retries and duplicate commands are safe.
 */
export interface AccessChangeResult<T> {
  changed: boolean;
  record: T | null;
}
