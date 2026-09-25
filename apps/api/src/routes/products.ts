import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { canManageProduct } from '@pump/shared';
import { CreateProduct, UpdateProduct, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { createDispatcher } from '../infra/events.js';
import { DrizzleProductRepository } from '../infra/repositories/product.repo.js';
import { DrizzleStockMovementRepository } from '../infra/repositories/inventory-repositories.js';
import { DrizzleBusinessDayRepository } from '../infra/repositories/station-ops-repositories.js';
import { loadStationClock, stationNotFound } from '../infra/station-clock.js';
import { runInTransaction } from '../infra/transaction.js';
import { sendResult } from '../infra/send-result.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const productsRouter = new Hono<{ Variables: Variables }>();

// GET /api/setup/products
productsRouter.get('/products', async (c) => {
  const repo = new DrizzleProductRepository(c.var.db);
  const data = await repo.listByOrganization(c.var.user.organizationId);
  return c.json({ success: true, data });
});

// POST /api/setup/products
productsRouter.post('/products', writePolicyGuard('POST /setup/products'), async (c) => {
  if (!canManageProduct(c.var.user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to create products' },
      },
      403,
    );
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  // Run in a transaction so the product row and any opening-stock movement commit
  // atomically. Load the station clock so opening stock resolves to the correct
  // business day (timezone / day-start aware) when a stationId is supplied.
  const stationClock = await loadStationClock(db, c.var.user.organizationId, body?.stationId);
  if (!stationClock) return stationNotFound(c);
  const result = await runInTransaction(db, (tx, events) =>
    new CreateProduct({
      repository: new DrizzleProductRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(c.var.user, { stationId: body?.stationId, ...stationClock })),
  );
  return sendResult(c, result);
});

// POST /api/setup/products/import — bulk create products from a (frontend-validated)
// CSV import. Each row is created in its OWN transaction so one bad row (e.g. a
// duplicate-code race) never rolls back the others; a per-row result summary is
// returned. Rows are expected pre-validated by the UI.
productsRouter.post(
  '/products/import',
  writePolicyGuard('POST /setup/products/import'),
  async (c) => {
    if (!canManageProduct(c.var.user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions to import products' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const rows: any[] = Array.isArray(body?.products) ? body.products : [];
    if (rows.length === 0) {
      return c.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'No products to import' } },
        400,
      );
    }
    if (rows.length > 2000) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Import is limited to 2000 rows at a time' },
        },
        400,
      );
    }
    const db = c.var.db;
    const stationId = body?.stationId ?? undefined;
    const stationClock = await loadStationClock(db, c.var.user.organizationId, stationId);
    if (!stationClock) return stationNotFound(c);
    const created: Array<{ id: string; code: string }> = [];
    const failed: Array<{ code?: string; name?: string; error: string }> = [];
    for (const row of rows) {
      const result = await runInTransaction(db, (tx, events) =>
        new CreateProduct({
          repository: new DrizzleProductRepository(tx),
          stock: new DrizzleStockMovementRepository(tx),
          businessDays: new DrizzleBusinessDayRepository(tx),
          events,
        }).execute({ ...row, stationId }, buildContext(c.var.user, { stationId, ...stationClock })),
      );
      if (result.success) created.push({ id: result.data.id, code: result.data.code });
      else failed.push({ code: row?.code, name: row?.name, error: result.error.message });
    }
    return c.json({
      success: true,
      data: { total: rows.length, createdCount: created.length, created, failed },
    });
  },
);

// PUT /api/setup/products/:id
productsRouter.put('/products/:id', writePolicyGuard('PUT /setup/products/:id'), async (c) => {
  if (!canManageProduct(c.var.user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to modify products' },
      },
      403,
    );
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const useCase = new UpdateProduct({
    repository: new DrizzleProductRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute({ ...body, id }, buildContext(c.var.user));
  return sendResult(c, result);
});

// DELETE /api/setup/products/:id  (archive -> isActive=false)
productsRouter.delete(
  '/products/:id',
  writePolicyGuard('DELETE /setup/products/:id'),
  async (c) => {
    if (!canManageProduct(c.var.user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions to modify products' },
        },
        403,
      );
    }
    const id = c.req.param('id');
    const db = c.var.db;
    const useCase = new UpdateProduct({
      repository: new DrizzleProductRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ id, isActive: false }, buildContext(c.var.user));
    return sendResult(c, result);
  },
);
