import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { shapeOrganizationPayload } from '@pump/core';
import { isOwner, organizationUpdateSchema } from '@pump/shared';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
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
 * Access answer is declared in `write-policy-declarations.ts` (#626).
 */
export async function updateOrganizationHandler(c: OrganizationContext) {
  const user = c.var.user;
  if (!isOwner(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Owners can manage the organization' },
      },
      403,
    );
  }
  const body = await c.req.json<unknown>().catch(() => ({}));
  const parsed = organizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid input',
        },
      },
      400,
    );
  }
  const [updated] = await c.var.db
    .update(schema.organizations)
    .set({ name: parsed.data.name, metadata: parsed.data.metadata ?? {}, updatedAt: new Date() })
    .where(eq(schema.organizations.id, user.organizationId))
    .returning();
  if (!updated) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }
  return c.json({ success: true, data: shapeOrganizationPayload(updated, user.role) });
}

/** Mounted at `/organization` through TENANT_ROUTERS. */
export const organizationRouter = new Hono<{ Variables: Variables }>();

organizationRouter.get('/', getOrganizationHandler);
organizationRouter.put('/', writePolicyGuard('PUT /organization'), updateOrganizationHandler);
