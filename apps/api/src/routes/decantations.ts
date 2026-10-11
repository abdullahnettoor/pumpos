import { Hono, type Context } from 'hono';
import { and, eq, ne } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { canRecordDecantation, isAuthorizedForStation } from '@pump/shared';
import {
  GetDecantation,
  ListDecantations,
  listDecantationsSchema,
  RecordDecantation,
  recordDecantationSchema,
  type RecordDecantationCommand,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { TimestampDocumentNumberGenerator } from '../infra/doc-numbers.js';
import {
  createDecantationMeasurement,
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
import { validateJson } from '../utils/validator.js';

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
  }).execute(query.data, buildContext(user, { stationId }));
  return sendResult(c, result);
});

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

  const rows = await c.var.db
    .select({
      documentNumber: schema.decantations.documentNumber,
      flags: schema.decantations.flags,
      lineStatus: schema.decantationTankLines.status,
      productId: schema.decantationTankLines.productId,
      linkedPurchaseId: schema.decantationPurchases.purchaseId,
    })
    .from(schema.decantations)
    .leftJoin(
      schema.decantationTankLines,
      and(
        eq(schema.decantationTankLines.decantationId, schema.decantations.id),
        eq(schema.decantationTankLines.organizationId, user.organizationId),
        eq(schema.decantationTankLines.stationId, stationId!),
      ),
    )
    .leftJoin(
      schema.decantationPurchases,
      and(
        eq(schema.decantationPurchases.decantationId, schema.decantations.id),
        eq(schema.decantationPurchases.productId, schema.decantationTankLines.productId),
        eq(schema.decantationPurchases.organizationId, user.organizationId),
        eq(schema.decantationPurchases.stationId, stationId!),
      ),
    )
    .where(
      and(
        eq(schema.decantations.organizationId, user.organizationId),
        eq(schema.decantations.stationId, stationId!),
        eq(schema.decantations.businessDayId, businessDayId),
        ne(schema.decantations.status, 'DRAFT'),
      ),
    );

  const pendingMeasurement = new Set<string>();
  const purchaseNotLinked = new Set<string>();
  const flagged = new Set<string>();
  for (const row of rows) {
    if (row.lineStatus === 'PENDING_MEASUREMENT') pendingMeasurement.add(row.documentNumber);
    if (row.productId && !row.linkedPurchaseId) purchaseNotLinked.add(row.documentNumber);
    if (Array.isArray(row.flags) && row.flags.length > 0) flagged.add(row.documentNumber);
  }
  return c.json({
    success: true,
    data: {
      pendingMeasurement: [...pendingMeasurement].sort(),
      purchaseNotLinked: [...purchaseNotLinked].sort(),
      flagged: [...flagged].sort(),
    },
  });
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
