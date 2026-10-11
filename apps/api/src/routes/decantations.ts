import { Hono, type Context } from 'hono';
import type { DbClient, DbExecutor } from '@pump/db';
import { canRecordDecantation, isAuthorizedForStation } from '@pump/shared';
import {
  DiscardDecantation,
  GetDecantation,
  LinkDecantationPurchase,
  GetDecantationDayCloseWarnings,
  ListDecantations,
  ListLinkablePurchases,
  UnlinkDecantationPurchase,
  decantationLinkSchema,
  listLinkablePurchasesSchema,
  listDecantationsSchema,
  RecordDecantation,
  recordDecantationSchema,
  type RecordDecantationCommand,
  type EventPublisher,
  type Result,
  err,
  notFoundError,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { TimestampDocumentNumberGenerator } from '../infra/doc-numbers.js';
import {
  createDecantationLinker,
  createDecantationMeasurement,
  DrizzleDecantationLinkRepository,
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../infra/repositories/decantation-repositories.js';
import { DrizzleTankRepository } from '../infra/repositories/setup-repositories.js';
import { DrizzleBusinessDayRepository } from '../infra/repositories/station-ops-repositories.js';
import { sendResult } from '../infra/send-result.js';
import {
  loadStationClock,
  loadStationDecantationSettings,
  stationNotFound,
} from '../infra/station-clock.js';
import { lockStationInventory, runInTransaction } from '../infra/transaction.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';
import { validateJson, validateParams } from '../utils/validator.js';
import { z } from 'zod';

const idParam = z.object({ id: z.string().uuid() });
const idProductParams = z.object({ id: z.string().uuid(), productId: z.string().uuid() });

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

async function record(c: Ctx, body: RecordDecantationCommand) {
  const denied = guardStation(c, body.stationId);
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
    return new RecordDecantation({
      decantations: new DrizzleDecantationRepository(tx),
      densityReadings: new DrizzleDensityReadingRepository(tx),
      tanks: new DrizzleTankRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      docNumbers,
      events,
      measurement: createDecantationMeasurement(tx, events),
      linking: createDecantationLinker(tx, events, settings ?? undefined),
      ...(settings ? { settings } : {}),
    }).execute(body, buildContext(user, { stationId: body.stationId, ...clock }));
  });
  return sendResult(c, result);
}

decantationsRouter.post(
  '/decantations',
  writePolicyGuard('POST /transactions/decantations'),
  validateJson(recordDecantationSchema),
  async (c) => {
    const body = c.req.valid('json');
    return record(c, { ...body, decantationId: undefined });
  },
);

decantationsRouter.put(
  '/decantations/:id',
  writePolicyGuard('PUT /transactions/decantations/:id'),
  validateJson(recordDecantationSchema),
  async (c) => {
    const body = c.req.valid('json');
    return record(c, { ...body, decantationId: c.req.param('id') });
  },
);

decantationsRouter.post(
  '/decantations/:id/discard',
  writePolicyGuard('POST /transactions/decantations/:id/discard'),
  validateParams(idParam),
  async (c) => {
    const { id } = c.req.valid('param');
    const user = c.var.user;
    if (!canRecordDecantation(user.role))
      return forbidden(c, 'Insufficient permissions for decantations');
    const stationId = await stationOfDecantation(c, id);
    if (!stationId) return sendResult(c, err(notFoundError('Decantation', id)));
    const denied = guardStation(c, stationId);
    if (denied) return denied;
    const result = await runInTransaction(c.var.db, async (tx, events) => {
      await lockStationInventory(tx, user.organizationId, stationId);
      return new DiscardDecantation({
        decantations: new DrizzleDecantationRepository(tx),
        events,
      }).execute({ decantationId: id }, buildContext(user, { stationId }));
    });
    return sendResult(c, result);
  },
);

decantationsRouter.get('/decantations', async (c) => {
  const user = c.var.user;
  const query = listDecantationsSchema.safeParse(c.req.query());
  if (!query.success)
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            query.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') ||
            'Invalid query',
        },
      },
      400,
    );
  const stationId = query.data.stationId;
  const denied = guardStation(c, stationId);
  if (denied) return denied;
  if (!(await loadStationClock(c.var.db, user.organizationId, stationId)))
    return stationNotFound(c);
  const result = await new ListDecantations({
    decantations: new DrizzleDecantationRepository(c.var.db),
    links: new DrizzleDecantationLinkRepository(c.var.db),
  }).execute(query.data, buildContext(user, { stationId }));
  return sendResult(c, result);
});

decantationsRouter.get('/decantations/linkable-purchases', async (c) => {
  const user = c.var.user;
  // Authorize the station first so a foreign station is refused before validation.
  const denied = guardStation(c, c.req.query('stationId'));
  if (denied) return denied;
  if (!(await loadStationClock(c.var.db, user.organizationId, c.req.query('stationId'))))
    return stationNotFound(c);
  const query = listLinkablePurchasesSchema.safeParse(c.req.query());
  if (!query.success)
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'stationId and productId are required' },
      },
      400,
    );
  const result = await new ListLinkablePurchases({
    links: new DrizzleDecantationLinkRepository(c.var.db),
  }).execute(query.data, buildContext(user, { stationId: query.data.stationId }));
  return sendResult(c, result);
});

/** Load the Decantation's station so the link routes can authorize it. */
async function stationOfDecantation(c: Ctx, id: string) {
  const found = await new GetDecantation({
    decantations: new DrizzleDecantationRepository(c.var.db),
  }).execute({ decantationId: id }, buildContext(c.var.user, {}));
  return found.success ? found.data.stationId : null;
}

async function linkChange(
  c: Ctx,
  decantationId: string,
  run: (
    tx: DbExecutor,
    events: EventPublisher,
    ctx: ReturnType<typeof buildContext>,
    settings: Awaited<ReturnType<typeof loadStationDecantationSettings>>,
  ) => Promise<Result<unknown>>,
) {
  const user = c.var.user;
  if (!canRecordDecantation(user.role))
    return forbidden(c, 'Insufficient permissions for decantations');
  const stationId = await stationOfDecantation(c, decantationId);
  if (!stationId) return sendResult(c, err(notFoundError('Decantation', decantationId)));
  const denied = guardStation(c, stationId);
  if (denied) return denied;
  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
  const settings = await loadStationDecantationSettings(c.var.db, user.organizationId, stationId);
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    await lockStationInventory(tx, user.organizationId, stationId);
    return run(tx, events, buildContext(user, { stationId, ...clock }), settings);
  });
  return sendResult(c, result);
}

decantationsRouter.put(
  '/decantations/:id/purchases',
  writePolicyGuard('PUT /transactions/decantations/:id/purchases'),
  validateParams(idParam),
  validateJson(decantationLinkSchema),
  async (c) => {
    const body = c.req.valid('json');
    const { id } = c.req.valid('param');
    return linkChange(c, id, (tx, events, ctx, settings) =>
      new LinkDecantationPurchase({
        links: new DrizzleDecantationLinkRepository(tx),
        decantations: new DrizzleDecantationRepository(tx),
        settler: createDecantationMeasurement(tx, events),
        events,
        ...(settings ? { settings } : {}),
      }).execute({ decantationId: id, ...body }, ctx),
    );
  },
);

decantationsRouter.delete(
  '/decantations/:id/purchases/:productId',
  writePolicyGuard('DELETE /transactions/decantations/:id/purchases/:productId'),
  validateParams(idProductParams),
  async (c) => {
    const { id, productId } = c.req.valid('param');
    return linkChange(c, id, (tx, events, ctx, settings) =>
      new UnlinkDecantationPurchase({
        links: new DrizzleDecantationLinkRepository(tx),
        decantations: new DrizzleDecantationRepository(tx),
        settler: createDecantationMeasurement(tx, events),
        events,
        ...(settings ? { settings } : {}),
      }).execute({ decantationId: id, productId }, ctx),
    );
  },
);

/** Non-blocking warnings shown before a Business Day is closed (ADR 0007). */
decantationsRouter.get('/decantations/day-close-warnings', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const businessDayId = c.req.query('businessDayId');
  const denied = guardStation(c, stationId);
  if (denied) return denied;
  if (!(await loadStationClock(c.var.db, user.organizationId, stationId)))
    return stationNotFound(c);
  if (!businessDayId)
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'businessDayId is required' } },
      400,
    );

  const result = await new GetDecantationDayCloseWarnings({
    decantations: new DrizzleDecantationRepository(c.var.db),
  }).execute({ stationId: stationId!, businessDayId }, buildContext(user, { stationId }));
  return sendResult(c, result);
});

decantationsRouter.get('/decantations/:id', async (c) => {
  const user = c.var.user;
  if (!canRecordDecantation(user.role))
    return forbidden(c, 'Insufficient permissions for decantations');
  const result = await new GetDecantation({
    decantations: new DrizzleDecantationRepository(c.var.db),
    links: new DrizzleDecantationLinkRepository(c.var.db),
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
