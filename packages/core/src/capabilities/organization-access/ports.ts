import type { LimitKey } from '@pump/shared';

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
  usage: Record<LimitKey, number>;
}

/** Loads the access inputs for one Organization. */
export interface OrganizationAccessReader {
  load(organizationId: string): Promise<OrganizationAccessInputs>;
}
