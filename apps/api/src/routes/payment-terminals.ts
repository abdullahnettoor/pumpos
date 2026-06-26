import { Hono } from 'hono';
import type { DbClient } from '@pump/db';
import type { Role } from '@pump/shared';
import {
  RegisterPaymentTerminal,
  UpdatePaymentTerminal,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { createDispatcher } from '../infra/events.js';
import { DrizzlePaymentTerminalRepository } from '../infra/repositories/payment-terminal.repo.js';

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

export const paymentTerminalsRouter = new Hono<{ Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) {
    return c.json({ success: true, data: result.data });
  }
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

function canWrite(c: any, stationId?: string | null): boolean {
  const user = c.var.user;
  if (user.role === 'Owner') return true;
  if (user.role === 'Manager') return !!stationId && user.assignedStationIds.includes(stationId);
  return false;
}

// GET /api/setup/payment-terminals?stationId=...
paymentTerminalsRouter.get('/payment-terminals', async (c) => {
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  const repo = new DrizzlePaymentTerminalRepository(c.var.db);
  const data = await repo.listByStation(c.var.user.organizationId, stationId);
  return c.json({ success: true, data });
});

// POST /api/setup/payment-terminals
paymentTerminalsRouter.post('/payment-terminals', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!canWrite(c, body?.stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not permitted to manage terminals for this station' } }, 403);
  }
  const db = c.var.db;
  const useCase = new RegisterPaymentTerminal({
    repository: new DrizzlePaymentTerminalRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute(body, buildContext(c.var.user, { stationId: body?.stationId }));
  return sendResult(c, result);
});

// PUT /api/setup/payment-terminals/:id
paymentTerminalsRouter.put('/payment-terminals/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const repo = new DrizzlePaymentTerminalRepository(db);
  const existing = await repo.findById(id);
  if (!existing || existing.organizationId !== c.var.user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } }, 404);
  }
  if (!canWrite(c, existing.stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not permitted to manage terminals for this station' } }, 403);
  }
  const useCase = new UpdatePaymentTerminal({ repository: repo, events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(c.var.user, { stationId: existing.stationId }));
  return sendResult(c, result);
});

// DELETE /api/setup/payment-terminals/:id  (soft delete -> deactivate)
paymentTerminalsRouter.delete('/payment-terminals/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.var.db;
  const repo = new DrizzlePaymentTerminalRepository(db);
  const existing = await repo.findById(id);
  if (!existing || existing.organizationId !== c.var.user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } }, 404);
  }
  if (!canWrite(c, existing.stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not permitted to manage terminals for this station' } }, 403);
  }
  const useCase = new UpdatePaymentTerminal({ repository: repo, events: createDispatcher(db) });
  const result = await useCase.execute({ id, isActive: false }, buildContext(c.var.user, { stationId: existing.stationId }));
  return sendResult(c, result);
});
