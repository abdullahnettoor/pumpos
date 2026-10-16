import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { shapeOrganizationPayload } from '@pump/core';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';

type OrganizationContext = Context<{ Variables: { db: DbClient; user: AuthenticatedPrincipal } }>;

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
