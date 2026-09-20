import type { MiddlewareHandler } from 'hono';
import type { DbClient } from '@pump/db';
import { requireCapability, type AccessRegistry } from '@pump/core';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import { DrizzleOrganizationAccessReader } from './repositories/organization-access.repo.js';
import { sendResult } from './send-result.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

/**
 * Gate a route on a Product Capability.
 *
 * The API is authoritative: access is re-read from the database on every
 * request, so revoking an Entitlement takes effect immediately even for a
 * client still holding the old Access Document. This composes with — and does
 * not replace — the Role guards; a route usually needs both.
 *
 * Usage:
 *   router.post('/exports/tally', requireCapabilityGuard('exports.tally'), handler)
 *
 * The registry override exists for tests, which gate on an injected test
 * capability rather than registering an unimplemented production feature.
 */
export function requireCapabilityGuard(
  capabilityKey: string,
  options: { registry?: AccessRegistry } = {},
): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    const result = await requireCapability(
      { access: new DrizzleOrganizationAccessReader(c.var.db), registry: options.registry },
      c.var.user.organizationId,
      capabilityKey,
    );

    if (!result.success) return sendResult(c, result);

    await next();
  };
}
