import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import {
  ClearOrganizationLimitOverride,
  ConfirmOrganizationPayment,
  GetAccessDocument,
  GrantOrganizationCapability,
  PRODUCT_ACCESS_REGISTRY,
  RevokeOrganizationCapability,
  SetOrganizationLimitOverride,
  SetOrganizationPlan,
  SetOrganizationSubscriptionStatus,
} from '@pump/core';
import { buildPlatformContext, type PlatformAdminPrincipal } from '../infra/context.js';
import { runInTransaction } from '../infra/transaction.js';
import { sendResult } from '../infra/send-result.js';
import {
  DrizzleOrganizationAccessAdminRepository,
  DrizzleOrganizationAccessReader,
  DrizzleOrganizationSubscriptionRepository,
} from '../infra/repositories/organization-access.repo.js';

type Variables = {
  db: DbClient;
  platformAdmin: PlatformAdminPrincipal;
};

/**
 * Platform administration of Organization access. Mounted inside the protected
 * `/platform` group, so every route here is already restricted to a PumpOS
 * platform administrator — tenant users have no path to these commands.
 *
 * The Organization UUID is the authoritative argument; use the owners list to
 * find it. Every real change and its business event commit in one transaction,
 * and repeated commands return `changed: false` without writing or emitting.
 */
export const platformAccessRouter = new Hono<{ Variables: Variables }>();

async function readJson(c: any): Promise<Record<string, unknown>> {
  try {
    return (await c.req.json()) ?? {};
  } catch {
    return {};
  }
}

/** Read a body field as a string, treating any other JSON type as absent. */
function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

/**
 * GET /platform/organizations/:orgId/access — effective access plus the full
 * grant and override history. Platform-only: tenants receive the role-filtered
 * Access Document from `/api/access` instead, never these raw rows.
 */
platformAccessRouter.get('/:orgId/access', async (c) => {
  const db = c.var.db;
  const organizationId = c.req.param('orgId');
  const repository = new DrizzleOrganizationAccessAdminRepository(db);

  const document = await new GetAccessDocument({
    access: new DrizzleOrganizationAccessReader(db),
  }).execute({ role: 'Owner' }, buildPlatformContext(c.var.platformAdmin, organizationId));
  if (!document.success) return sendResult(c, document);

  const [grants, overrides] = await Promise.all([
    repository.listGrants(organizationId),
    repository.listOverrides(organizationId),
  ]);

  return c.json({
    success: true,
    data: {
      organizationId,
      // What the Organization effectively has, as its Owner would see it.
      effective: document.data,
      // What this build can grant at all, so an operator never guesses a key.
      registry: {
        plans: Object.keys(PRODUCT_ACCESS_REGISTRY.plans),
        capabilities: Object.keys(PRODUCT_ACCESS_REGISTRY.capabilities),
        limits: ['station_count'],
      },
      grants,
      limitOverrides: overrides,
    },
  });
});

/** POST /platform/organizations/:orgId/capabilities — grant one capability. */
platformAccessRouter.post('/:orgId/capabilities', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new GrantOrganizationCapability({
      repository: new DrizzleOrganizationAccessAdminRepository(tx),
      events,
    }).execute(
      {
        capabilityKey: stringField(body, 'capabilityKey'),
        reason: stringField(body, 'reason') || null,
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/** DELETE /platform/organizations/:orgId/capabilities/:key — revoke it. */
platformAccessRouter.delete('/:orgId/capabilities/:key', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RevokeOrganizationCapability({
      repository: new DrizzleOrganizationAccessAdminRepository(tx),
      events,
    }).execute(
      {
        capabilityKey: c.req.param('key'),
        reason: stringField(body, 'reason') || null,
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/** PUT /platform/organizations/:orgId/limits/:key — set or replace a Limit. */
platformAccessRouter.put('/:orgId/limits/:key', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new SetOrganizationLimitOverride({
      repository: new DrizzleOrganizationAccessAdminRepository(tx),
      events,
    }).execute(
      {
        limitKey: c.req.param('key'),
        value: Number(body.value),
        reason: stringField(body, 'reason'),
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/** DELETE /platform/organizations/:orgId/limits/:key — back to the plan value. */
platformAccessRouter.delete('/:orgId/limits/:key', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new ClearOrganizationLimitOverride({
      repository: new DrizzleOrganizationAccessAdminRepository(tx),
      events,
    }).execute(
      {
        limitKey: c.req.param('key'),
        reason: stringField(body, 'reason') || null,
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/**
 * PUT /platform/organizations/:orgId/plan — assign a Product Plan.
 *
 * Plan keys are code-defined, so an unknown one is rejected before anything
 * is written: configuration can never name a package this build cannot serve.
 */
platformAccessRouter.put('/:orgId/plan', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new SetOrganizationPlan({
      subscriptions: new DrizzleOrganizationSubscriptionRepository(tx),
      events,
    }).execute(
      {
        plan: stringField(body, 'plan'),
        reason: stringField(body, 'reason') || null,
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/**
 * PUT /platform/organizations/:orgId/subscription — move the Organization to
 * a Subscription Status, optionally with the instant its access runs through.
 *
 * Omitting `accessUntil` on PAST_DUE applies the standard Payment Grace
 * Period; omitting it on any other status clears the window.
 */
platformAccessRouter.put('/:orgId/subscription', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new SetOrganizationSubscriptionStatus({
      subscriptions: new DrizzleOrganizationSubscriptionRepository(tx),
      events,
    }).execute(
      {
        status: stringField(body, 'status'),
        // Distinguish "not supplied" (derive it) from an explicit null (clear).
        ...('accessUntil' in body ? { accessUntil: stringField(body, 'accessUntil') || null } : {}),
        reason: stringField(body, 'reason') || null,
        actor: c.var.platformAdmin,
      },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});

/**
 * POST /platform/organizations/:orgId/subscription/confirm-payment — payment
 * received: ACTIVE again immediately, grace window cleared.
 */
platformAccessRouter.post('/:orgId/subscription/confirm-payment', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = await readJson(c);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new ConfirmOrganizationPayment({
      subscriptions: new DrizzleOrganizationSubscriptionRepository(tx),
      events,
    }).execute(
      { reason: stringField(body, 'reason') || null, actor: c.var.platformAdmin },
      buildPlatformContext(c.var.platformAdmin, organizationId),
    ),
  );
  return sendResult(c, result);
});
