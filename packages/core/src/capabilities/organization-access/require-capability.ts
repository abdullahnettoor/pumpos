import { capabilityNotEntitledError, err, ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import type { OrganizationAccessReader } from './ports.js';
import { resolveEffectiveCapabilities } from './resolve-access.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/**
 * The Product Capability gate.
 *
 * Roles answer "may this user do it"; this answers "has this Organization
 * been given it at all". Both must pass, and they are checked separately:
 * an Owner of an Organization without the Entitlement is refused here, with
 * CAPABILITY_NOT_ENTITLED rather than FORBIDDEN.
 *
 * Access is re-read per call, never taken from the caller's document: a
 * client holding a stale Access Document from before a revocation gets
 * refused by the server on its next attempt.
 */
export interface CapabilityGuardDeps {
  access: OrganizationAccessReader;
  /** Override only in tests; production always uses the shipped registry. */
  registry?: AccessRegistry;
}

export async function requireCapability(
  deps: CapabilityGuardDeps,
  organizationId: string,
  capabilityKey: string,
): Promise<Result<void>> {
  const registry = deps.registry ?? PRODUCT_ACCESS_REGISTRY;
  const inputs = await deps.access.load(organizationId);
  const entitled = resolveEffectiveCapabilities(inputs, registry);
  if (entitled.has(capabilityKey)) return ok(undefined);

  // Fail closed for a key this build does not define: an operation gated on
  // an unknown capability must refuse, not wave the request through.
  const definition = registry.capabilities[capabilityKey];
  return err(
    capabilityNotEntitledError(
      definition?.unavailableMessage ?? 'This feature is not available for your Organization.',
      {
        capability: capabilityKey,
        // Safe for any Role to see: it names the next action, not a price.
        resolution: definition?.resolution ?? 'CONTACT_PUMPOS',
        actionLabel: 'Contact PumpOS',
      },
    ),
  );
}
