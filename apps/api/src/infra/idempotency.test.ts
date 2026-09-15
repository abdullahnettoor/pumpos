import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  createIdempotencyMiddleware,
  type IdempotencyRecord,
  type IdempotencyStore,
} from './idempotency.js';

class MemoryStore implements IdempotencyStore {
  private nextId = 1;
  readonly rows = new Map<string, IdempotencyRecord>();

  private key(organizationId: string, key: string) {
    return `${organizationId}:${key}`;
  }

  async reserve(
    organizationId: string,
    key: string,
    requestPath: string,
    actorId: string | null,
    requestHash: string | null,
  ) {
    const scopedKey = this.key(organizationId, key);
    if (this.rows.has(scopedKey)) return null;
    const id = String(this.nextId++);
    this.rows.set(scopedKey, {
      id,
      requestPath,
      actorId,
      requestHash,
      responseStatus: null,
      responseBody: null,
    });
    return id;
  }

  async find(organizationId: string, key: string) {
    return this.rows.get(this.key(organizationId, key)) ?? null;
  }

  async release(id: string) {
    for (const [key, row] of this.rows) if (row.id === id) this.rows.delete(key);
  }

  async complete(id: string, status: number, body: unknown) {
    for (const [key, row] of this.rows)
      if (row.id === id) this.rows.set(key, { ...row, responseStatus: status, responseBody: body });
  }
}

function appFor(store: MemoryStore, organizationId = 'org-1', userId = 'user-1') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user' as never, { id: userId, organizationId } as never);
    c.set('db' as never, {} as never);
    await next();
  });
  app.use(
    '*',
    createIdempotencyMiddleware(() => store),
  );
  return app;
}

describe('idempotency middleware', () => {
  it('returns the accepted response without executing the command twice', async () => {
    const store = new MemoryStore();
    const app = appFor(store);
    let executions = 0;
    app.post('/command', (c) => c.json({ success: true, data: { execution: ++executions } }, 201));

    const first = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
    });
    const replay = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
    });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ success: true, data: { execution: 1 } });
    expect(executions).toBe(1);
  });

  it('scopes identical keys by Organization and rejects cross-endpoint reuse', async () => {
    const store = new MemoryStore();
    const firstOrg = appFor(store, 'org-1');
    const secondOrg = appFor(store, 'org-2');
    firstOrg.post('/first', (c) => c.json({ success: true, data: 'first' }));
    firstOrg.post('/second', (c) => c.json({ success: true, data: 'second' }));
    secondOrg.post('/first', (c) => c.json({ success: true, data: 'other-org' }));

    await firstOrg.request('/first', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'same-key' },
    });
    const otherOrg = await secondOrg.request('/first', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'same-key' },
    });
    const otherPath = await firstOrg.request('/second', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'same-key' },
    });

    expect(await otherOrg.json()).toEqual({ success: true, data: 'other-org' });
    expect(otherPath.status).toBe(409);
  });

  it('releases reservations after thrown handlers so retry can execute', async () => {
    const store = new MemoryStore();
    const app = appFor(store);
    let executions = 0;
    app.onError((error, c) =>
      c.json({ success: false, error: { code: 'INTERNAL', message: error.message } }, 500),
    );
    app.post('/command', (c) => {
      executions++;
      if (executions === 1) throw new Error('transient');
      return c.json({ success: true });
    });

    const first = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
    });
    const retry = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
    });

    expect(first.status).toBe(500);
    expect(retry.status).toBe(200);
    expect(executions).toBe(2);
  });

  it('rejects replay by a different same-tenant actor', async () => {
    const store = new MemoryStore();
    const alice = appFor(store, 'org-1', 'alice');
    const bob = appFor(store, 'org-1', 'bob');
    alice.post('/command', (c) => c.json({ success: true, data: 'alice' }));
    bob.post('/command', (c) => c.json({ success: true, data: 'bob' }));

    await alice.request('/command', { method: 'POST', headers: { 'Idempotency-Key': 'shared' } });
    const replay = await bob.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared' },
    });

    expect(replay.status).toBe(409);
  });

  it('rejects the same key with different request content', async () => {
    const store = new MemoryStore();
    const app = appFor(store);
    let executions = 0;
    app.post('/command', (c) => c.json({ success: true, data: ++executions }));

    const first = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
      body: JSON.stringify({ amount: 100 }),
    });
    const changed = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
      body: JSON.stringify({ amount: 999 }),
    });
    const trueRetry = await app.request('/command', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
      body: JSON.stringify({ amount: 100 }),
    });

    expect(first.status).toBe(200);
    expect(changed.status).toBe(409);
    expect(trueRetry.status).toBe(200);
    expect(await trueRetry.json()).toEqual({ success: true, data: 1 });
    expect(executions).toBe(1);
  });
});
