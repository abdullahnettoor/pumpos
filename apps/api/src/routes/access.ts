import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { GetAccessDocument, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { DrizzleOrganizationAccessReader } from '../infra/repositories/organization-access.repo.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const accessRouter = new Hono<{ Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

/**
 * GET /api/access — the caller's Access Document.
 *
 * Role filtering happens on the server, so the response already omits
 * anything this user may not see. Clients use it for presentation only; every
 * protected operation is still checked here.
 */
accessRouter.get('/access', async (c) => {
  const user = c.var.user;
  const useCase = new GetAccessDocument({
    access: new DrizzleOrganizationAccessReader(c.var.db),
  });
  const result = await useCase.execute({ role: user.role }, buildContext(user));
  return sendResult(c, result);
});
