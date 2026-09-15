import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';

export interface IdempotencyRecord {
  id: string;
  requestPath: string | null;
  actorId: string | null;
  requestHash: string | null;
  responseStatus: number | null;
  responseBody: unknown;
}

export interface IdempotencyStore {
  reserve(
    organizationId: string,
    key: string,
    requestPath: string,
    actorId: string | null,
    requestHash: string | null,
  ): Promise<string | null>;
  find(organizationId: string, key: string): Promise<IdempotencyRecord | null>;
  release(id: string): Promise<void>;
  complete(id: string, status: number, body: unknown): Promise<void>;
}

class DrizzleIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: DbClient) {}

  async reserve(
    organizationId: string,
    key: string,
    requestPath: string,
    actorId: string | null,
    requestHash: string | null,
  ): Promise<string | null> {
    const [row] = await this.db
      .insert(schema.idempotencyKeys)
      .values({ organizationId, idempotencyKey: key, requestPath, actorId, requestHash })
      .onConflictDoNothing()
      .returning({ id: schema.idempotencyKeys.id });
    return row?.id ?? null;
  }

  async find(organizationId: string, key: string): Promise<IdempotencyRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.idempotencyKeys)
      .where(
        and(
          eq(schema.idempotencyKeys.organizationId, organizationId),
          eq(schema.idempotencyKeys.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row
      ? {
          id: row.id,
          requestPath: row.requestPath,
          actorId: row.actorId ?? null,
          requestHash: row.requestHash ?? null,
          responseStatus: row.responseStatus,
          responseBody: row.responseBody,
        }
      : null;
  }

  async release(id: string): Promise<void> {
    await this.db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.id, id));
  }

  async complete(id: string, status: number, body: unknown): Promise<void> {
    await this.db
      .update(schema.idempotencyKeys)
      .set({ responseStatus: status, responseBody: body as Record<string, unknown> | null })
      .where(eq(schema.idempotencyKeys.id, id));
  }
}

type StoreFactory = (db: DbClient) => IdempotencyStore;

/** SHA-256 hex of the raw request body ('' hashes too, so GET-less bodies bind). */
async function hashRequestBody(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Idempotency middleware. When a mutating request carries an `Idempotency-Key`
 * header, the first request reserves the key and caches its final response;
 * subsequent requests with the same key return the cached response instead of
 * re-executing the write. This makes command submission safe to retry (network
 * timeouts, offline replay) without duplicating effects.
 *
 * Replay is bound to the original request: the SAME actor resending the SAME
 * body on the SAME method+path. A different same-tenant user, or changed
 * request content, gets a 409 conflict instead of the cached response.
 * (Legacy rows without actor/hash replay by path alone.)
 *
 * - GET/HEAD and keyless requests pass through untouched.
 * - 5xx responses are NOT cached (the reservation is released) so transient
 *   failures can be retried.
 * - Concurrent in-flight duplicates get a 409 until the first completes.
 *
 * Must run after auth (needs `c.var.user`) and the db middleware (`c.var.db`).
 */
export function createIdempotencyMiddleware(
  createStore: StoreFactory = (db) => new DrizzleIdempotencyStore(db),
): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const key = c.req.header('Idempotency-Key') ?? c.req.header('idempotency-key');
    const user = (c.var as any).user as { id?: string; organizationId?: string } | undefined;
    const db = (c.var as any).db as DbClient | undefined;

    if (method === 'GET' || method === 'HEAD' || !key || !user?.organizationId || !db) {
      return next();
    }
    const orgId = user.organizationId;
    const actorId = user.id ?? null;
    const requestPath = `${method} ${c.req.path}`;
    // Hono memoizes the body, so downstream handlers can still read it.
    const bodyText = await c.req.text().catch(() => '');
    const requestHash = await hashRequestBody(bodyText);
    const store = createStore(db);

    // Reserve the key (first writer wins via the unique constraint).
    const reservationId = await store.reserve(orgId, key, requestPath, actorId, requestHash);

    if (!reservationId) {
      const existing = await store.find(orgId, key);
      if (existing && existing.responseStatus != null) {
        if (
          existing.requestPath &&
          existing.requestPath !== c.req.path &&
          existing.requestPath !== requestPath
        ) {
          return c.json(
            {
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'This Idempotency-Key was already used for another request',
              },
            },
            409,
          );
        }
        if (existing.actorId && actorId && existing.actorId !== actorId) {
          return c.json(
            {
              success: false,
              error: { code: 'CONFLICT', message: 'This Idempotency-Key belongs to another user' },
            },
            409,
          );
        }
        if (existing.requestHash && existing.requestHash !== requestHash) {
          return c.json(
            {
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'This Idempotency-Key was already used with different request content',
              },
            },
            409,
          );
        }
        return c.json(existing.responseBody as any, existing.responseStatus as any);
      }
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A request with this Idempotency-Key is already in progress',
          },
        },
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
