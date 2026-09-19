import type { LimitKey, SubscriptionStatus } from '@pump/shared';

/**
 * Everything the access policy needs about one Organization, loaded in a
 * single read by the adapter. Domain functions never query; they resolve.
 */
export interface OrganizationAccessInputs {
  /** Stored Product Plan key; unknown values fall back to the baseline plan. */
  plan: string | null;
  /** Stored Subscription Status; legacy/unknown values normalize to ACTIVE. */
  subscriptionStatus: string | null;
  /** ISO instant access is paid through, or null. Enforced in Phase E2. */
  accessUntil: string | null;
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

/**
 * Legacy Subscription Status values written before Phase E normalized the
 * column. Kept as a resolver-side safety net for rows an older build may
 * still write; the migration rewrites existing data to the typed values.
 */
const LEGACY_STATUS: Record<string, SubscriptionStatus> = {
  Active: 'ACTIVE',
  Deactivated: 'SUSPENDED',
  Revoked: 'SUSPENDED',
};

const KNOWN_STATUSES: readonly SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'RESTRICTED',
  'CANCELED',
  'SUSPENDED',
];

/**
 * Map a stored status onto the typed union. An unrecognized value resolves to
 * ACTIVE on purpose: a corrupt string must never silently lock a paying
 * station out of its own operations. Suspension is always explicit.
 */
export function normalizeSubscriptionStatus(raw: string | null | undefined): SubscriptionStatus {
  if (!raw) return 'ACTIVE';
  const upper = raw.toUpperCase();
  const known = KNOWN_STATUSES.find((status) => status === upper);
  return known ?? LEGACY_STATUS[raw] ?? 'ACTIVE';
}
