import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { GetAccessDocument } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { DrizzleOrganizationAccessReader } from '../infra/repositories/organization-access.repo.js';
import { sendResult } from '../infra/send-result.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const accessRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/access — the caller's Access Document.
 *
 * Role filtering happens on the server, so the response already omits
 * anything this user may not see. Clients use it for presentation only; every
 * protected operation is still checked here.
 */
accessRouter.get('/', async (c) => {
  const user = c.var.user;
  const useCase = new GetAccessDocument({
    access: new DrizzleOrganizationAccessReader(c.var.db),
  });
  const result = await useCase.execute({ role: user.role }, buildContext(user));
  return sendResult(c, result);
});
