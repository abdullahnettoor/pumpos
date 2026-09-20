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
 * How an *unavailable* capability is presented. `HIDDEN` entries are dropped
 * before the document leaves the server, so a client never learns about
 * commercial options it may not see — which means only `UPGRADE` ever reaches
 * the wire.
 */
export type CapabilityVisibility = 'HIDDEN' | 'UPGRADE';

/**
 * One capability as presented to the requesting user. `visibility`,
 * `unavailableMessage` and `resolution` describe how to explain the absence,
 * so they appear only on disabled entries.
 */
export interface AccessCapabilityEntry {
  enabled: boolean;
  title: string;
  visibility?: CapabilityVisibility;
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

/**
 * Is this Product Capability available to the holder of this document?
 *
 * Absent access data — a cold start, or a Role the entry is not sent to —
 * means "not available": a client never grants what the server has not
 * confirmed. Presentation only; the API re-checks every protected operation.
 */
export function capabilityEnabled(access: AccessDocument | undefined, capability: string): boolean {
  return access?.capabilities[capability]?.enabled === true;
}

/**
 * How a client should present one Product Capability:
 *  - `enabled`  — the Organization has it; render the feature.
 *  - `upgrade`  — it is unavailable and this user may be told how to get it
 *                 (Owners and Managers only; the server decides).
 *  - `hidden`   — unavailable and not this user's concern, or access is not
 *                 known yet (cold start). Render nothing.
 */
export type CapabilityState =
  | { status: 'enabled'; title: string }
  | { status: 'upgrade'; title: string; message: string; resolution: ResolutionCode }
  | { status: 'hidden' };

/**
 * Resolve the presentation state of one capability. This is the single
 * decision every gate — navigation entry, action button, whole route — should
 * ask, so they cannot drift apart. It never authorizes anything: the API
 * re-checks access on every protected operation.
 */
export function capabilityState(
  access: AccessDocument | undefined,
  capability: string,
): CapabilityState {
  const entry = access?.capabilities[capability];
  if (!entry) return { status: 'hidden' };
  if (entry.enabled) return { status: 'enabled', title: entry.title };
  // The server only sends a disabled entry to a Role that may act on it, so
  // its presence is the permission to explain it.
  return {
    status: 'upgrade',
    title: entry.title,
    message: entry.unavailableMessage ?? 'This feature is not available for your Organization.',
    resolution: entry.resolution ?? 'CONTACT_PUMPOS',
  };
}

/**
 * The sentence shown when Station capacity is used up. Defined once: the API
 * puts it in the LIMIT_REACHED error, the Organization screen shows it beside
 * a disabled onboarding action, and they must not drift.
 */
export function stationLimitMessage(value: number): string {
  return value === 1
    ? 'This plan includes one Station. Contact PumpOS to add another.'
    : `This plan includes ${value} Stations. Contact PumpOS to add another.`;
}

/** Error code the API returns when the Organization lacks a capability. */
export const CAPABILITY_NOT_ENTITLED = 'CAPABILITY_NOT_ENTITLED';

/** Error code the API returns when a numeric Limit is used up. */
export const LIMIT_REACHED = 'LIMIT_REACHED';

/**
 * Did this failure come from Organization access policy rather than the
 * request itself?
 *
 * #167 adds SUBSCRIPTION_RESTRICTED and ORGANIZATION_SUSPENDED: both belong
 * in this list, since either also means the client's Access Document is out
 * of date. This is a published client contract — extend it, never narrow it.
 * Such a rejection means the client's Access Document is
 * stale (a grant was revoked, a Limit changed) and should be refetched.
 */
export function isAccessPolicyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === CAPABILITY_NOT_ENTITLED || code === LIMIT_REACHED;
}
