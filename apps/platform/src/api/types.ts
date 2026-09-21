/**
 * Wire shapes of the `/platform/*` routes, transcribed from
 * `apps/api/src/index.ts` and `apps/api/src/routes/platform-access.ts`.
 *
 * Declared here rather than imported from the API: these are the platform
 * back-office's own contract, and a local admin tool must not drag the server's
 * Hono/Drizzle types into a browser bundle.
 */

export type OwnerStatus = 'invited' | 'active' | 'deactivated' | 'unlinked' | 'unknown';

export interface OwnerRow {
  organizationId: string;
  organizationName: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  owner: {
    userId: string;
    authUserId: string | null;
    email: string | null;
    fullName: string | null;
    userStatus: string;
    emailConfirmedAt: string | null;
    invitedAt: string | null;
    lastSignInAt: string | null;
    bannedUntil: string | null;
    status: OwnerStatus;
  } | null;
  stationCount: number;
  readyStationCount: number;
}

export interface InviteResult {
  authUserId: string;
  email: string;
  /** Present only in the no-email (password) mode. Shown once, never refetched. */
  password?: string;
}

export interface AccessCapabilityEntry {
  enabled: boolean;
  title: string;
  unavailableMessage?: string;
}

export interface AccessLimitEntry {
  value: number;
  used: number;
  reached: boolean;
}

export interface AccessSubscription {
  status: string;
  mode: string;
  accessUntil: string | null;
  showWarning: boolean;
  warningMessage: string | null;
  resolution: string | null;
}

export interface CapabilityGrant {
  capabilityKey: string;
  reason: string | null;
  createdAt: string;
  grantedByEmail: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
}

export interface LimitOverride {
  limitKey: string;
  value: number;
  reason: string | null;
  createdAt: string;
  assignedByEmail: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
}

export interface OrganizationAccess {
  organizationId: string;
  effective: {
    plan?: string;
    capabilities: Record<string, AccessCapabilityEntry>;
    limits: Record<string, AccessLimitEntry>;
    subscription: AccessSubscription;
  };
  /**
   * What this build can grant at all. The UI renders controls from this and
   * never hardcodes a key, so a capability added to the API appears here
   * without a change to this app.
   */
  registry: {
    plans: string[];
    capabilities: string[];
    limits: string[];
  };
  grants: CapabilityGrant[];
  limitOverrides: LimitOverride[];
}

/** A mutation that was already in effect reports `changed: false`, not an error. */
export interface AccessChange {
  changed?: boolean;
}

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'RESTRICTED',
  'CANCELED',
  'SUSPENDED',
] as const;
