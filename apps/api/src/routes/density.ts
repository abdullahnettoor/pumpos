import { Hono, type Context } from 'hono';
import type { DbClient } from '@pump/db';
import { canRecordDensity, isAuthorizedForStation } from '@pump/shared';
import {
  GetDensityTodaySummary,
  ListDensityReadings,
  RecordDensityReading,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { DrizzleDensityReadingRepository } from '../infra/repositories/decantation-repositories.js';
import { sendResult } from '../infra/send-result.js';
import {
  loadStationClock,
  loadStationDecantationSettings,
  stationNotFound,
} from '../infra/station-clock.js';
import { lockStationInventory, runInTransaction } from '../infra/transaction.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';

type Variables = { db: DbClient; user: AuthenticatedPrincipal };
type Ctx = Context<{ Variables: Variables }>;

/**
 * Density register (ticket #471): daily morning readings, ad-hoc readings,
 * 15 °C calculations, unexplained jump detection, and today's display board summary.
 * Mounted under `/transactions`. Owner / Manager / Accountant.
 */
export const densityRouter = new Hono<{ Variables: Variables }>();

const forbidden = (c: Ctx, message: string) =>
  c.json({ success: false, error: { code: 'FORBIDDEN', message } }, 403);

function guardStation(c: Ctx, stationId: string | null | undefined) {
  const user = c.var.user;
  if (!canRecordDensity(user.role))
    return forbidden(c, 'Insufficient permissions for density register');
  if (!stationId)
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId }))
    return forbidden(c, 'No access to this station');
  return null;
}

densityRouter.post(
  '/density/readings',
  writePolicyGuard('POST /transactions/density/readings'),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const denied = guardStation(c, body?.stationId);
    if (denied) return denied;

    const user = c.var.user;
    const clock = await loadStationClock(c.var.db, user.organizationId, body.stationId);
    if (!clock) return stationNotFound(c);

    const settings = await loadStationDecantationSettings(
      c.var.db,
      user.organizationId,
      body.stationId,
    );

    const result = await runInTransaction(c.var.db, async (tx, events) => {
      await lockStationInventory(tx, user.organizationId, body.stationId);
      return new RecordDensityReading({
        densityReadings: new DrizzleDensityReadingRepository(tx),
        events,
        ...(settings ? { settings } : {}),
      }).execute(body, buildContext(user, { stationId: body.stationId, ...clock }));
    });

    return sendResult(c, result);
  },
);

densityRouter.get('/density/readings', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const denied = guardStation(c, stationId);
  if (denied) return denied;

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);

  const result = await new ListDensityReadings({
    densityReadings: new DrizzleDensityReadingRepository(c.var.db),
  }).execute(
    {
      stationId: stationId!,
      productId: c.req.query('productId'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      kind: c.req.query('kind') as any,
      limit: c.req.query('limit') as any,
    },
    buildContext(user, { stationId, ...clock }),
  );

  return sendResult(c, result);
});

densityRouter.get('/density/today', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const denied = guardStation(c, stationId);
  if (denied) return denied;

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);

  const result = await new GetDensityTodaySummary({
    densityReadings: new DrizzleDensityReadingRepository(c.var.db),
  }).execute(
    {
      stationId: stationId!,
      businessDate: c.req.query('businessDate'),
    },
    buildContext(user, { stationId, ...clock }),
  );

  return sendResult(c, result);
});
