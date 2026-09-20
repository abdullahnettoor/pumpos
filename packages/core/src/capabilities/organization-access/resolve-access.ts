import type {
  AccessCapabilityEntry,
  AccessDocument,
  AccessLimitEntry,
  AccessMode,
  AccessSubscription,
  LimitKey,
  ResolutionCode,
  Role,
  SubscriptionStatus,
} from '@pump/shared';
import { PAYMENT_GRACE_DAYS } from '@pump/shared';
import { PRODUCT_ACCESS_REGISTRY, resolveProductPlan, type AccessRegistry } from './registry.js';
import type { OrganizationAccessInputs } from './ports.js';

/**
 * Pure access resolution. Given what the Organization has (plan, grants,
 * overrides, usage, subscription) and who is asking, produce the Access
 * Document the client renders. No I/O, no framework, no database.
 */

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
 * Map a stored status onto the typed union.
 *
 * This FAILS OPEN: an unrecognized or missing value resolves to ACTIVE. That
 * is the right default in Phase E1, where the status is reported and nothing
 * is enforced — a corrupt string must not lock a paying station out of its
 * own operations, and suspension is always explicit.
 *
 * INVERT THIS IN #167 (Restricted and Suspended write policy). Once the status
 * gates writes, failing open means a garbled value silently grants normal
 * access — the opposite of what a write policy is for. When #167 lands, an
 * unreadable status should resolve to RESTRICTED (finish open work, block
 * growth) rather than ACTIVE, and the unparseable value should be surfaced
 * rather than swallowed. Every caller of this function inherits the choice:
 * `buildAccessDocument` (what the operator sees) and, after #167, the write
 * guards themselves.
 */
export function normalizeSubscriptionStatus(raw: string | null | undefined): SubscriptionStatus {
  // Phase E1 default; see the #167 note above before changing behaviour.
  if (!raw) return 'ACTIVE';
  const upper = raw.toUpperCase();
  const known = KNOWN_STATUSES.find((status) => status === upper);
  // Unreadable value → ACTIVE (fail open). #167 must change this to RESTRICTED.
  return known ?? LEGACY_STATUS[raw] ?? 'ACTIVE';
}

/** Roles that may see commercial information: the plan and upgrade guidance. */
const COMMERCIAL_ROLES: readonly Role[] = ['Owner', 'Manager'];

/** Does this Role make or escalate purchasing decisions? */
export function seesCommercialAccess(role: Role): boolean {
  return COMMERCIAL_ROLES.includes(role);
}

/**
 * Effective capabilities = Product Plan capabilities + active Organization
 * grants. Grants are purely additive: an Organization grant can never deny
 * something the plan supplies. Keys the registry does not define are dropped,
 * so a stale grant row cannot unlock behaviour this build lacks.
 */
export function resolveEffectiveCapabilities(
  inputs: OrganizationAccessInputs,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): Set<string> {
  const plan = resolveProductPlan(inputs.plan, registry);
  const effective = new Set<string>();
  for (const key of [...plan.capabilities, ...inputs.grantedCapabilities]) {
    if (Object.prototype.hasOwnProperty.call(registry.capabilities, key)) effective.add(key);
  }
  return effective;
}

/**
 * Effective Limit = the active Organization override when present, otherwise
 * the Product Plan value. An override replaces the plan value; it does not
 * add to it.
 */
export function resolveEffectiveLimit(
  key: LimitKey,
  inputs: OrganizationAccessInputs,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): number {
  const override = inputs.limitOverrides[key];
  if (typeof override === 'number') return override;
  return resolveProductPlan(inputs.plan, registry).limits[key];
}

/**
 * Access mode for a Subscription Status, evaluated against the paid-through
 * instant at request time.
 *
 * Request-time evaluation is deliberate: there is no scheduled job flipping
 * Organizations to RESTRICTED when a grace period lapses. A PAST_DUE
 * Organization keeps normal access until `access_until` passes, and the very
 * next request after that instant resolves as RESTRICTED. Nothing to schedule,
 * nothing to miss, and the answer cannot drift from the clock.
 *
 * `now` is passed in rather than read here so the decision stays pure and the
 * boundary instants are testable.
 */
export function resolveSubscriptionMode(
  status: SubscriptionStatus,
  context: { accessUntil?: string | null; now?: Date } = {},
): AccessMode {
  switch (status) {
    case 'SUSPENDED':
      // A manual security, legal, fraud or abuse stop. No grace, ever.
      return 'SUSPENDED';
    case 'RESTRICTED':
      return 'RESTRICTED';
    case 'PAST_DUE':
    case 'CANCELED':
    case 'TRIALING':
      // Paid (or trialling) through a known instant: normal until it passes.
      return withinAccessWindow(context) ? 'NORMAL' : 'RESTRICTED';
    case 'ACTIVE':
      return 'NORMAL';
  }
}

/**
 * Is the Organization still inside its paid-through window?
 *
 * A missing `access_until` means the window was never set. That reads as open
 * rather than expired: E1 rows carry no instant, and a Phase E1 Organization
 * marked PAST_DUE must not be restricted retroactively by a deploy.
 */
function withinAccessWindow(context: { accessUntil?: string | null; now?: Date }): boolean {
  if (!context.accessUntil) return true;
  const until = Date.parse(context.accessUntil);
  if (Number.isNaN(until)) return true;
  return (context.now?.getTime() ?? Date.now()) < until;
}

/**
 * The instant a Payment Grace Period ends: `PAYMENT_GRACE_DAYS` after the
 * payment failed. Used when a platform command marks an Organization PAST_DUE
 * without supplying its own paid-through instant.
 */
export function paymentGraceUntil(from: Date): string {
  return new Date(from.getTime() + PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Billing guidance: what is wrong and what fixes it. Only Owners and Managers
 * receive this — a Staff member cannot complete a payment, and telling them
 * the balance is overdue is neither useful nor theirs to know.
 */
function billingGuidance(
  status: SubscriptionStatus,
  mode: AccessMode,
  accessUntil: string | null,
): { message: string; resolution: ResolutionCode } | null {
  switch (status) {
    case 'PAST_DUE':
      return mode === 'NORMAL'
        ? {
            message: accessUntil
              ? `Your last subscription payment did not go through. Complete payment by ${formatDay(accessUntil)} to avoid interruption.`
              : 'Your last subscription payment did not go through. Complete payment to avoid interruption.',
            resolution: 'COMPLETE_PAYMENT',
          }
        : {
            message:
              'Access is restricted because the subscription payment is overdue. Open station work can still be finished.',
            resolution: 'COMPLETE_PAYMENT',
          };
    case 'RESTRICTED':
      return {
        message:
          'Access is restricted until payment is completed. Open station work can still be finished.',
        resolution: 'COMPLETE_PAYMENT',
      };
    case 'CANCELED':
      return mode === 'NORMAL'
        ? {
            message: accessUntil
              ? `This subscription is canceled and access ends on ${formatDay(accessUntil)}.`
              : 'This subscription is canceled.',
            resolution: 'CONTACT_PUMPOS',
          }
        : {
            message: 'This subscription is canceled. Contact PumpOS to restore full access.',
            resolution: 'CONTACT_PUMPOS',
          };
    case 'SUSPENDED':
      return {
        message: 'This Organization is suspended. Contact PumpOS.',
        resolution: 'WAIT_FOR_REACTIVATION',
      };
    case 'TRIALING':
    case 'ACTIVE':
      return null;
  }
}

/** Calendar day of an instant, for copy like "Complete payment by 26 Sep 2026". */
function formatDay(instant: string): string {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return instant;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Non-commercial Roles still need to know that operations are restricted —
 * it is why their write was refused — but get no billing detail and no
 * paid-through instant.
 */
function operationalNotice(mode: AccessMode): string | null {
  switch (mode) {
    case 'RESTRICTED':
      return 'This Organization has limited access. You can finish open station work; contact your Owner or Manager.';
    case 'SUSPENDED':
      return 'This Organization is suspended. Contact your Owner or Manager.';
    case 'NORMAL':
      return null;
  }
}

function resolveSubscription(
  inputs: OrganizationAccessInputs,
  role: Role,
  now: Date,
): AccessSubscription {
  const status = normalizeSubscriptionStatus(inputs.subscriptionStatus);
  const mode = resolveSubscriptionMode(status, { accessUntil: inputs.accessUntil, now });

  if (!seesCommercialAccess(role)) {
    const notice = operationalNotice(mode);
    return {
      status,
      mode,
      accessUntil: null,
      showWarning: notice !== null,
      warningMessage: notice,
      resolution: notice ? 'CONTACT_OWNER_OR_MANAGER' : null,
    };
  }

  const guidance = billingGuidance(status, mode, inputs.accessUntil);
  return {
    status,
    mode,
    accessUntil: inputs.accessUntil,
    showWarning: guidance !== null,
    warningMessage: guidance?.message ?? null,
    resolution: guidance?.resolution ?? null,
  };
}

function resolveLimits(
  inputs: OrganizationAccessInputs,
  registry: AccessRegistry,
): Record<LimitKey, AccessLimitEntry> {
  const plan = resolveProductPlan(inputs.plan, registry);
  const entries = {} as Record<LimitKey, AccessLimitEntry>;
  for (const key of Object.keys(plan.limits) as LimitKey[]) {
    const value = resolveEffectiveLimit(key, inputs, registry);
    const used = inputs.usage[key] ?? 0;
    entries[key] = { value, used, reached: used >= value };
  }
  return entries;
}

/**
 * Capabilities as this Role may see them:
 *  - entitled capabilities are always enabled entries;
 *  - unentitled ones appear as disabled upgrade entries for Owners and
 *    Managers when the registry marks them upgradable;
 *  - everyone else (Accountant, Staff, Attendant) receives enabled entries
 *    only, so daily workflows carry no pricing or upgrade prompts.
 */
function resolveCapabilities(
  inputs: OrganizationAccessInputs,
  role: Role,
  registry: AccessRegistry,
): Record<string, AccessCapabilityEntry> {
  const entitled = resolveEffectiveCapabilities(inputs, registry);
  const entries: Record<string, AccessCapabilityEntry> = {};
  for (const definition of Object.values(registry.capabilities)) {
    if (entitled.has(definition.key)) {
      entries[definition.key] = { enabled: true, title: definition.title };
      continue;
    }
    if (!definition.upgradable || !seesCommercialAccess(role)) continue;
    entries[definition.key] = {
      enabled: false,
      title: definition.title,
      visibility: 'UPGRADE',
      unavailableMessage: definition.unavailableMessage,
      resolution: definition.resolution,
    };
  }
  return entries;
}

/**
 * Build the role-filtered Access Document. Filtering happens here, on the
 * server: a client is never sent commercial information it may not see and
 * then trusted to hide it.
 */
export function buildAccessDocument(input: {
  inputs: OrganizationAccessInputs;
  role: Role;
  registry?: AccessRegistry;
  /** Evaluation instant; defaults to now. Passed explicitly by use-cases. */
  now?: Date;
}): AccessDocument {
  const registry = input.registry ?? PRODUCT_ACCESS_REGISTRY;
  const { inputs, role } = input;
  const plan = resolveProductPlan(inputs.plan, registry);
  return {
    ...(seesCommercialAccess(role) ? { plan: plan.key } : {}),
    capabilities: resolveCapabilities(inputs, role, registry),
    limits: resolveLimits(inputs, registry),
    subscription: resolveSubscription(inputs, role, input.now ?? new Date()),
  };
}
