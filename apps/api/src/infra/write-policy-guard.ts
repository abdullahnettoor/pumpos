import type { MiddlewareHandler } from 'hono';
import type { DbClient } from '@pump/db';
import { evaluateWritePolicy, resolveAccessMode, SystemClock, type Clock } from '@pump/core';
import type { WritePolicyRegistry } from '@pump/core';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import { DrizzleOrganizationAccessReader } from './repositories/organization-access.repo.js';
import { sendResult } from './send-result.js';
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
 * Every mutating tenant route carries one. The per-family coverage tests fail
 * if a route loses its guard or gains a mutation without a declaration, so the
 * matrix and the enforcement cannot drift apart.
 */
export function writePolicyGuard(
  operation: string,
  options: { registry?: WritePolicyRegistry; clock?: Clock } = {},
): MiddlewareHandler<{ Variables: Variables }> {
  const registry = options.registry ?? WRITE_POLICY_DECLARATIONS;
  // Injectable so the grace-period boundary is testable at the point that
  // actually decides whether the write happens.
  const clock = options.clock ?? new SystemClock();
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

    // One resolver, shared with the Access Document: a guard and the document
    // the operator is reading must never disagree about the mode.
    const decision = evaluateWritePolicy(resolveAccessMode(inputs, clock.now()), declaration);
    if (!decision.success) return sendResult(c, decision);

    await next();
  };
}
