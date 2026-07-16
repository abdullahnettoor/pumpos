import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';

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
export const idempotency: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  const key = c.req.header('Idempotency-Key') ?? c.req.header('idempotency-key');
  const user = (c.var as any).user as { organizationId?: string } | undefined;
  const db = (c.var as any).db as DbClient | undefined;

  if (method === 'GET' || method === 'HEAD' || !key || !user?.organizationId || !db) {
    return next();
  }
  const orgId = user.organizationId;

  // Reserve the key (first writer wins via the unique constraint).
  const reserved = await db
    .insert(schema.idempotencyKeys)
    .values({ organizationId: orgId, idempotencyKey: key, requestPath: c.req.path })
    .onConflictDoNothing()
    .returning({ id: schema.idempotencyKeys.id });

  if (reserved.length === 0) {
    const [existing] = await db
      .select()
      .from(schema.idempotencyKeys)
      .where(and(eq(schema.idempotencyKeys.organizationId, orgId), eq(schema.idempotencyKeys.idempotencyKey, key)))
      .limit(1);
    if (existing && existing.responseStatus != null) {
      return c.json(existing.responseBody as any, existing.responseStatus as any);
    }
    return c.json(
      { success: false, error: { code: 'CONFLICT', message: 'A request with this Idempotency-Key is already in progress' } },
      409,
    );
  }

  const reservationId = reserved[0].id;
  await next();

  const res = c.res;
  const status = res?.status ?? 200;

  // Release the reservation on server errors so the client can retry.
  if (status >= 500) {
    await db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.id, reservationId));
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
  await db
    .update(schema.idempotencyKeys)
    .set({ responseStatus: status, responseBody: body as Record<string, unknown> | null })
    .where(eq(schema.idempotencyKeys.id, reservationId));
};
