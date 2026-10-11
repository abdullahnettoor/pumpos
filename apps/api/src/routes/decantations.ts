import { Hono, type Context } from 'hono';
import type { DbClient } from '@pump/db';
import { canRecordDecantation, isAuthorizedForStation } from '@pump/shared';
import { GetDecantation, ListDecantations, RecordDecantation } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { TimestampDocumentNumberGenerator } from '../infra/doc-numbers.js';
import {
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../infra/repositories/decantation-repositories.js';
import { DrizzleTankRepository } from '../infra/repositories/setup-repositories.js';
import { DrizzleBusinessDayRepository } from '../infra/repositories/station-ops-repositories.js';
import { sendResult } from '../infra/send-result.js';
import { loadStationClock, stationNotFound } from '../infra/station-clock.js';
import { lockStationInventory, runInTransaction } from '../infra/transaction.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';

type Variables = { db: DbClient; user: AuthenticatedPrincipal };
type Ctx = Context<{ Variables: Variables }>;

/**
 * Decantations (ADR 0007): one tanker visit with tank lines + chambers.
 * Mounted under `/transactions`. Owner / Manager / Accountant only.
 */
export const decantationsRouter = new Hono<{ Variables: Variables }>();

const docNumbers = new TimestampDocumentNumberGenerator();

const forbidden = (c: Ctx, message: string) =>
  c.json({ success: false, error: { code: 'FORBIDDEN', message } }, 403);

function guardStation(c: Ctx, stationId: string | null | undefined) {
  const user = c.var.user;
  if (!canRecordDecantation(user.role))
    return forbidden(c, 'Insufficient permissions for decantations');
  if (!stationId)
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId }))
    return forbidden(c, 'No access to this station');
  return null;
}

async function record(c: Ctx, body: any) {
  const denied = guardStation(c, body?.stationId);
  if (denied) return denied;
  const user = c.var.user;
  const clock = await loadStationClock(c.var.db, user.organizationId, body.stationId);
  if (!clock) return stationNotFound(c);
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    await lockStationInventory(tx, user.organizationId, body.stationId);
    return new RecordDecantation({
      decantations: new DrizzleDecantationRepository(tx),
      densityReadings: new DrizzleDensityReadingRepository(tx),
      tanks: new DrizzleTankRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      docNumbers,
      events,
      // #464: pass loadStationDecantationSettings(...) here once it lands.
    }).execute(body, buildContext(user, { stationId: body.stationId, ...clock }));
  });
  return sendResult(c, result);
}

decantationsRouter.post(
  '/decantations',
  writePolicyGuard('POST /transactions/decantations'),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return record(c, { ...body, decantationId: undefined });
  },
);

decantationsRouter.put(
  '/decantations/:id',
  writePolicyGuard('PUT /transactions/decantations/:id'),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return record(c, { ...body, decantationId: c.req.param('id') });
  },
);

decantationsRouter.get('/decantations', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const denied = guardStation(c, stationId);
  if (denied) return denied;
  if (!(await loadStationClock(c.var.db, user.organizationId, stationId!)))
    return stationNotFound(c);
  const result = await new ListDecantations({
    decantations: new DrizzleDecantationRepository(c.var.db),
  }).execute(
    {
      stationId: stationId!,
      from: c.req.query('from'),
      to: c.req.query('to'),
      status: c.req.query('status') as any,
      limit: c.req.query('limit') as any,
    },
    buildContext(user, { stationId: stationId! }),
  );
  return sendResult(c, result);
});

decantationsRouter.get('/decantations/:id', async (c) => {
  const user = c.var.user;
  if (!canRecordDecantation(user.role))
    return forbidden(c, 'Insufficient permissions for decantations');
  const result = await new GetDecantation({
    decantations: new DrizzleDecantationRepository(c.var.db),
  }).execute({ decantationId: c.req.param('id') }, buildContext(user, {}));
  if (
    result.success &&
    !isAuthorizedForStation(user, {
      organizationId: user.organizationId,
      stationId: result.data.stationId,
    })
  )
    return forbidden(c, 'No access to this station');
  return sendResult(c, result);
});
