import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';

export interface IdempotencyRecord {
  id: string;
  requestPath: string | null;
  responseStatus: number | null;
  responseBody: unknown;
}

export interface IdempotencyStore {
  reserve(organizationId: string, key: string, requestPath: string): Promise<string | null>;
  find(organizationId: string, key: string): Promise<IdempotencyRecord | null>;
  release(id: string): Promise<void>;
  complete(id: string, status: number, body: unknown): Promise<void>;
}

class DrizzleIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: DbClient) {}

  async reserve(organizationId: string, key: string, requestPath: string): Promise<string | null> {
    const [row] = await this.db.insert(schema.idempotencyKeys)
      .values({ organizationId, idempotencyKey: key, requestPath })
      .onConflictDoNothing()
      .returning({ id: schema.idempotencyKeys.id });
    return row?.id ?? null;
  }

  async find(organizationId: string, key: string): Promise<IdempotencyRecord | null> {
    const [row] = await this.db.select().from(schema.idempotencyKeys).where(and(
      eq(schema.idempotencyKeys.organizationId, organizationId),
      eq(schema.idempotencyKeys.idempotencyKey, key),
    )).limit(1);
    return row ? {
      id: row.id,
      requestPath: row.requestPath,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
    } : null;
  }

  async release(id: string): Promise<void> {
    await this.db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.id, id));
  }

  async complete(id: string, status: number, body: unknown): Promise<void> {
    await this.db.update(schema.idempotencyKeys)
      .set({ responseStatus: status, responseBody: body as Record<string, unknown> | null })
      .where(eq(schema.idempotencyKeys.id, id));
  }
}

type StoreFactory = (db: DbClient) => IdempotencyStore;

/**
 * Idempotency middleware. When a mutating request carries an `Idempotency-Key`
 * header, the first request reserves the key and caches its final response;
 * subsequent requests with the same key return the cached response instead of
 * re-executing the write. This makes command submission safe to retry (network
 * timeouts, offline replay) without duplicating effects.
 *
 * - GET/HEAD and keyless requests pass through untouched.
 * - 5xx responses are NOT cached (the reservation is released) so transient
 *   failures can be retried.
 * - Concurrent in-flight duplicates get a 409 until the first completes.
 *
 * Must run after auth (needs `c.var.user`) and the db middleware (`c.var.db`).
 */
export function createIdempotencyMiddleware(createStore: StoreFactory = (db) => new DrizzleIdempotencyStore(db)): MiddlewareHandler {
  return async (c, next) => {
  const method = c.req.method.toUpperCase();
  const key = c.req.header('Idempotency-Key') ?? c.req.header('idempotency-key');
  const user = (c.var as any).user as { organizationId?: string } | undefined;
  const db = (c.var as any).db as DbClient | undefined;

  if (method === 'GET' || method === 'HEAD' || !key || !user?.organizationId || !db) {
    return next();
  }
  const orgId = user.organizationId;
  const requestPath = `${method} ${c.req.path}`;
  const store = createStore(db);

  // Reserve the key (first writer wins via the unique constraint).
  const reservationId = await store.reserve(orgId, key, requestPath);

  if (!reservationId) {
    const existing = await store.find(orgId, key);
    if (existing && existing.responseStatus != null) {
      if (existing.requestPath && existing.requestPath !== c.req.path && existing.requestPath !== requestPath) {
        return c.json(
          { success: false, error: { code: 'CONFLICT', message: 'This Idempotency-Key was already used for another request' } },
          409,
        );
      }
      return c.json(existing.responseBody as any, existing.responseStatus as any);
    }
    return c.json(
      { success: false, error: { code: 'CONFLICT', message: 'A request with this Idempotency-Key is already in progress' } },
      409,
    );
  }

  try {
    await next();
  } catch (error) {
    await store.release(reservationId);
    throw error;
  }

  const res = c.res;
  const status = res?.status ?? 200;

  // Release the reservation on server errors so the client can retry.
  if (status >= 500) {
    await store.release(reservationId);
    return;
  }

  let body: unknown = null;
  if (res) {
    try {
      body = await res.clone().json();
    } catch {
      body = null;
    }
  }
  await store.complete(reservationId, status, body);
  };
}

export const idempotency = createIdempotencyMiddleware();
