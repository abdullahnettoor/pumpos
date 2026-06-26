import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import { canManageProduct, type Role } from '@pump/shared';
import { CreateProduct, UpdateProduct, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import { createDispatcher } from '../infra/events.js';
import { DrizzleProductRepository } from '../infra/repositories/product.repo.js';

type Variables = {
  db: DbClient;
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

export const productsRouter = new Hono<{ Variables: Variables }>();

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

// GET /api/setup/products
productsRouter.get('/products', async (c) => {
  const repo = new DrizzleProductRepository(c.var.db);
  const data = await repo.listByOrganization(c.var.user.organizationId);
  return c.json({ success: true, data });
});

// POST /api/setup/products
productsRouter.post('/products', async (c) => {
  if (!canManageProduct(c.var.user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to create products' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const useCase = new CreateProduct({
    repository: new DrizzleProductRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute(body, buildContext(c.var.user));
  return sendResult(c, result);
});

// PUT /api/setup/products/:id
productsRouter.put('/products/:id', async (c) => {
  if (!canManageProduct(c.var.user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to modify products' } }, 403);
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
productsRouter.delete('/products/:id', async (c) => {
  if (!canManageProduct(c.var.user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to modify products' } }, 403);
  }
  const id = c.req.param('id');
  const db = c.var.db;
  const useCase = new UpdateProduct({
    repository: new DrizzleProductRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute({ id, isActive: false }, buildContext(c.var.user));
  return sendResult(c, result);
});
