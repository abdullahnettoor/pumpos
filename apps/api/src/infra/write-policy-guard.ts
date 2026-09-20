import type { MiddlewareHandler } from 'hono';
import type { DbClient } from '@pump/db';
import {
  evaluateWritePolicy,
  normalizeSubscriptionStatus,
  resolveSubscriptionMode,
  type WritePolicyRegistry,
} from '@pump/core';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import { DrizzleOrganizationAccessReader } from './repositories/organization-access.repo.js';
import { STATUS_BY_CODE } from './send-result.js';
import { WRITE_POLICY_DECLARATIONS } from './write-policy-declarations.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

/**
 * Enforce the Restricted / Suspended write policy for one route.
 *
 * Access mode is resolved per request from current database state, so a
 * lapsed Payment Grace Period bites on the next call with nothing scheduled,
 * and a confirmed payment restores writes immediately.
 *
 * Adoption is per route family (#168-#171): a route is governed only once this
 * middleware is attached to it, which is why the declarations registry and the
 * coverage test exist ahead of the enforcement.
 */
export function writePolicyGuard(
  operation: string,
  options: { registry?: WritePolicyRegistry } = {},
): MiddlewareHandler<{ Variables: Variables }> {
  const registry = options.registry ?? WRITE_POLICY_DECLARATIONS;
  const declaration = registry[operation];
  if (!declaration) {
    // A programming error, caught at wiring time rather than per request: an
    // undeclared operation has no defensible default.
    throw new Error(
      `No write-policy declaration for "${operation}". Declare it in write-policy-declarations.ts.`,
    );
  }

  return async (c, next) => {
    const inputs = await new DrizzleOrganizationAccessReader(c.var.db).load(
      c.var.user.organizationId,
    );
    const mode = resolveSubscriptionMode(normalizeSubscriptionStatus(inputs.subscriptionStatus), {
      accessUntil: inputs.accessUntil,
      now: new Date(),
    });

    const decision = evaluateWritePolicy(mode, declaration);
    if (!decision.success) {
      const status = STATUS_BY_CODE[decision.error.code] ?? 403;
      return c.json({ success: false, error: decision.error }, status as 403);
    }

    await next();
  };
}
