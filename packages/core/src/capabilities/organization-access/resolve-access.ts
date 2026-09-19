import type {
  AccessCapabilityEntry,
  AccessDocument,
  AccessLimitEntry,
  AccessMode,
  AccessSubscription,
  LimitKey,
  Role,
  SubscriptionStatus,
} from '@pump/shared';
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
 * Access mode implied by the Subscription Status. Phase E1 reports the mode;
 * Phase E2 enforces it and adds `access_until` grace evaluation, at which
 * point PAST_DUE and CANCELED resolve against the paid-through instant rather
 * than the status alone.
 */
export function resolveSubscriptionMode(status: SubscriptionStatus): AccessMode {
  switch (status) {
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'RESTRICTED':
    case 'CANCELED':
      return 'RESTRICTED';
    case 'TRIALING':
    case 'ACTIVE':
    case 'PAST_DUE':
      return 'NORMAL';
  }
}

/** Payment guidance, shown only to the Roles that can act on it. */
function warningFor(status: SubscriptionStatus, role: Role): string | null {
  if (!seesCommercialAccess(role)) return null;
  switch (status) {
    case 'PAST_DUE':
      return 'Your last subscription payment did not go through. Complete payment to avoid interruption.';
    case 'RESTRICTED':
      return 'Access is restricted until payment is completed. Open station work can still be finished.';
    case 'CANCELED':
      return 'This subscription is canceled. Contact PumpOS to restore full access.';
    case 'SUSPENDED':
      return 'This Organization is suspended. Contact PumpOS.';
    case 'TRIALING':
    case 'ACTIVE':
      return null;
  }
}

function resolveSubscription(inputs: OrganizationAccessInputs, role: Role): AccessSubscription {
  const status = normalizeSubscriptionStatus(inputs.subscriptionStatus);
  const warningMessage = warningFor(status, role);
  return {
    status,
    mode: resolveSubscriptionMode(status),
    accessUntil: inputs.accessUntil,
    showWarning: warningMessage !== null,
    warningMessage,
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
}): AccessDocument {
  const registry = input.registry ?? PRODUCT_ACCESS_REGISTRY;
  const { inputs, role } = input;
  const plan = resolveProductPlan(inputs.plan, registry);
  return {
    ...(seesCommercialAccess(role) ? { plan: plan.key } : {}),
    capabilities: resolveCapabilities(inputs, role, registry),
    limits: resolveLimits(inputs, registry),
    subscription: resolveSubscription(inputs, role),
  };
}
