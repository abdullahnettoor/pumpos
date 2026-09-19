/**
 * Organization access contract (Phase E1).
 *
 * These types are the wire shape shared by the API and every client. The
 * *registry* that decides which capabilities a Product Plan supplies lives in
 * `@pump/core` (`organization-access`), never here and never in the database:
 * capability keys must not drift from deployed application behaviour.
 *
 * Access answers "has this Organization purchased or been granted this?".
 * A Role separately answers "may this user do it?" (`permissions/guards.ts`).
 */

/** Commercial package assigned to an Organization. `CORE` is the baseline. */
export type ProductPlanKey = 'CORE';

/**
 * A numeric allowance supplied by a Product Plan. `station_count` is the only
 * Limit in E1: every Station row an Organization owns consumes one.
 */
export type LimitKey = 'station_count';

/** The Organization's commercial access state. */
export type SubscriptionStatus =
  'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'CANCELED' | 'SUSPENDED';

/**
 * What the Organization may currently do, derived from Subscription Status.
 * E1 resolves the mode and reports it; E2 enforces RESTRICTED/SUSPENDED.
 */
export type AccessMode = 'NORMAL' | 'RESTRICTED' | 'SUSPENDED';

/** The next action that would restore access, rendered as UI guidance. */
export type ResolutionCode =
  | 'CONTACT_PUMPOS'
  | 'COMPLETE_PAYMENT'
  | 'CONTACT_OWNER_OR_MANAGER'
  | 'REDUCE_USAGE'
  | 'WAIT_FOR_REACTIVATION';

/**
 * How an unavailable capability is presented. `HIDDEN` entries are dropped
 * before the document leaves the server, so a client never learns about
 * commercial options it may not see.
 */
export type CapabilityVisibility = 'HIDDEN' | 'UPGRADE';

/** One capability as presented to the requesting user. */
export interface AccessCapabilityEntry {
  enabled: boolean;
  visibility: CapabilityVisibility;
  title: string;
  unavailableMessage?: string;
  resolution?: ResolutionCode;
}

/** Effective allowance plus current usage for one Limit. */
export interface AccessLimitEntry {
  value: number;
  used: number;
  reached: boolean;
}

/** Safe, role-filtered presentation of the Organization's subscription. */
export interface AccessSubscription {
  status: SubscriptionStatus;
  mode: AccessMode;
  accessUntil: string | null;
  showWarning: boolean;
  warningMessage: string | null;
}

/**
 * Server-computed, role-filtered view of what an Organization may use.
 * Clients use it for presentation only — the API is always authoritative.
 *
 * `plan` is absent for Staff and Attendants: the Product Plan key is
 * commercial information they have no use for.
 */
export interface AccessDocument {
  plan?: ProductPlanKey;
  capabilities: Record<string, AccessCapabilityEntry>;
  limits: Record<LimitKey, AccessLimitEntry>;
  subscription: AccessSubscription;
}
