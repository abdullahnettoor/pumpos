import { describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import { z } from 'zod';
import '@pump/shared';
import { validateJson, validateParams } from './validator.js';

const app = new Hono()
  .post(
    '/items',
    validateJson(z.object({ name: z.string().min(2), qty: z.number().positive() })),
    (c) => c.json({ success: true, data: c.req.valid('json') }),
  )
  .get('/items/:id', validateParams(z.object({ id: z.string().guid() })), (c) =>
    c.json({ success: true, data: c.req.valid('param') }),
  );

const post = (body: string) =>
  app.request('/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

describe('validateJson / validateParams (#722)', () => {
  it('answers VALIDATION_ERROR in the Zod 3 wording operators already see', async () => {
    const res = await post(JSON.stringify({ qty: 0 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'name: Required, qty: Number must be greater than 0',
      },
    });
  });

  it('passes the parsed body through', async () => {
    const res = await post(JSON.stringify({ name: 'Oil', qty: 2 }));
    expect(await res.json()).toEqual({ success: true, data: { name: 'Oil', qty: 2 } });
  });

  it('answers a body that is not JSON in the envelope', async () => {
    const res = await post('{');
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' },
    });
  });

  it('accepts any uuid-shaped id, as Postgres does', async () => {
    const id = '00000000-0000-0000-0000-0000000000b1';
    expect((await app.request(`/items/${id}`)).status).toBe(200);
    expect(await (await app.request('/items/nope')).json()).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'id: Invalid uuid' },
    });
  });
});
