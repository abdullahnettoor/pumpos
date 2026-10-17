import type { LimitKey, PermissionChanges } from '@pump/shared';

/**
 * Everything the access policy needs about one Organization, loaded in a
 * single read by the adapter. Domain functions never query; they resolve.
 */
export interface OrganizationAccessInputs {
  /** Stored Product Plan key; unknown values fall back to the baseline plan. */
  plan: string | null;
  /** Stored Subscription Status; legacy/unknown values normalize to ACTIVE. */
  subscriptionStatus: string | null;
  /** ISO instant access is paid through, or null. */
  accessUntil: string | null;
  /**
   * When PumpOS manually stopped this Organization, or null. Independent of
   * billing: a confirmed payment clears the Subscription Status, never this.
   */
  suspendedAt?: string | null;
  /** Capability keys from currently-active Organization grants (additive). */
  grantedCapabilities: readonly string[];
  /** Active Limit overrides; each replaces the Product Plan value. */
  limitOverrides: Partial<Record<LimitKey, number>>;
  /** Current consumption per Limit, e.g. the Organization's Station count. */
  usage: Partial<Record<LimitKey, number>>;
}

/** Loads the access inputs for one Organization. */
export interface OrganizationAccessReader {
  load(organizationId: string): Promise<OrganizationAccessInputs>;
}

/** Loads a user's stored Permission changes (differences from Role defaults). */
export interface UserPermissionChangesReader {
  /** Null when the user has no stored changes. */
  load(organizationId: string, userId: string): Promise<PermissionChanges | null>;
}

/** What the writer stores for one user: only differences from Role defaults. */
export interface StoredPermissionChanges {
  granted: string[];
  revoked: string[];
}

/** Writes a user's stored Permission changes. One row per user; empty means no row. */
export interface UserPermissionChangesWriter extends UserPermissionChangesReader {
  /** Insert or replace the user's changes. `id` is used only when inserting. */
  save(input: {
    id: string;
    organizationId: string;
    userId: string;
    changes: StoredPermissionChanges;
    updatedByUserId: string | null;
    at: string;
  }): Promise<void>;
  /** Remove the user's changes, if any. */
  clear(organizationId: string, userId: string): Promise<void>;
}
