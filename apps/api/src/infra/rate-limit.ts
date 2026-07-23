import type { Context, MiddlewareHandler } from 'hono';

/**
 * Lightweight per-isolate fixed-window rate limiter (defense-in-depth).
 *
 * Cloudflare reuses isolates across requests, so this module-level map behaves
 * as a warm per-isolate counter. It is intentionally NOT globally consistent
 * across isolates/colos — for the sensitive auth/admin surfaces it protects
 * (all already behind JWT + role/allow-list guards) it simply blunts bursts and
 * brute-force retries without adding infrastructure. Swap for the Cloudflare
 * Rate Limiting binding if a hard, distributed guarantee is ever required.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function take(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now > existing.resetAt) {
    // Opportunistic cleanup so the map can't grow without bound.
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (now > b.resetAt) buckets.delete(k);
      }
      if (buckets.size > MAX_BUCKETS) {
        const firstKey = buckets.keys().next().value;
        if (firstKey !== undefined) buckets.delete(firstKey);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

function clientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Hono middleware that limits requests per client IP within a fixed window.
 * `scope` namespaces the counter so different route groups don't share budget.
 */
export function rateLimit(opts: { scope: string; max: number; windowMs: number }): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return await next();
    const key = `${opts.scope}:${clientIp(c)}`;
    if (!take(key, opts.max, opts.windowMs)) {
      return c.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } },
        429,
      );
    }
    await next();
  };
}
