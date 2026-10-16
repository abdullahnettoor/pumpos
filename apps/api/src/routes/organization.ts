import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { shapeOrganizationPayload, UpdateOrganization } from '@pump/core';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { buildContext } from '../infra/context.js';
import { DrizzleOrganizationProfileRepository } from '../infra/repositories/organization-profile.repo.js';
import { sendResult } from '../infra/send-result.js';
import { runInTransaction } from '../infra/transaction.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';

type Variables = { db: DbClient; user: AuthenticatedPrincipal };
type OrganizationContext = Context<{ Variables: Variables }>;

/**
 * GET /api/organization — the caller's Organization, shaped for their Role
 * (#616). Plan and billing columns reach Owners and Managers only; the
 * shaping lives in `shapeOrganizationPayload`.
 */
export async function getOrganizationHandler(c: OrganizationContext) {
  const user = c.var.user;
  const org = await c.var.db.query.organizations.findFirst({
    where: eq(schema.organizations.id, user.organizationId),
  });
  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }
  return c.json({ success: true, data: shapeOrganizationPayload(org, user.role) });
}

/**
 * PUT /api/organization — the Owner edits the Organization's name and profile
 * (legal name, GSTIN, PAN, address, contact). Owner only. Its Restricted
 * Access answer is declared in `write-policy-declarations.ts` (#626). The
 * update and its ORGANIZATION_UPDATED event commit together (#634); the rules
 * live in the `UpdateOrganization` use-case.
 */
export async function updateOrganizationHandler(c: OrganizationContext) {
  const body = await c.req.json<unknown>().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateOrganization({
      repository: new DrizzleOrganizationProfileRepository(tx),
      events,
    }).execute(body, buildContext(c.var.user)),
  );
  return sendResult(c, result);
}

/** Mounted at `/organization` through TENANT_ROUTERS. */
export const organizationRouter = new Hono<{ Variables: Variables }>();

organizationRouter.get('/', getOrganizationHandler);
organizationRouter.put('/', writePolicyGuard('PUT /organization'), updateOrganizationHandler);
