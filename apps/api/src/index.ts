import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify, decode } from 'hono/jwt';
import { createDb, DbClient, schema } from '@pump/db';
import { eq, and, desc } from 'drizzle-orm';
import { Role, canManageUsers, organizationUpdateSchema } from '@pump/shared';
import { stationSetupRouter } from './routes/station-setup.js';
import { paymentTerminalsRouter } from './routes/payment-terminals.js';
import { productsRouter } from './routes/products.js';
import { shiftsRouter } from './routes/shifts.js';
import { transactionsRouter } from './routes/transactions.js';
import { dssrRouter } from './routes/dssr.js';
import { financeRouter } from './routes/finance.js';
import { idempotency } from './infra/idempotency.js';


const keyCache = new Map<string, CryptoKey>();

// --- Auth cache (per-isolate) --------------------------------------------
// Cloudflare Workers reuse isolates across many requests, so a module-level
// Map behaves as a warm per-isolate LRU. This eliminates the 2 DB round-trips
// (users + userStationAssignments) that would otherwise fire on every
// authenticated request — the single biggest source of Hyperdrive queries.
// TTL is deliberately short (60s) so role / assignment changes propagate
// promptly without any explicit invalidation.
type CachedAuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  organizationId: string;
  role: Role;
  assignedStationIds: string[];
};
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map<string, { user: CachedAuthUser; expiresAt: number }>();

function getCachedAuthUser(authId: string): CachedAuthUser | null {
  const entry = authCache.get(authId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(authId);
    return null;
  }
  return entry.user;
}

function setCachedAuthUser(authId: string, user: CachedAuthUser): void {
  authCache.set(authId, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  if (authCache.size > AUTH_CACHE_MAX) {
    const firstKey = authCache.keys().next().value;
    if (firstKey !== undefined) authCache.delete(firstKey);
  }
}

type Bindings = {
  HYPERDRIVE: Hyperdrive;
  // Optional legacy fallback for Supabase HS256 JWT projects. New Supabase
  // projects should use asymmetric JWTs (ES256) and JWKS verification instead.
  SUPABASE_JWT_SECRET?: string;
  // Optional fallback: when set, the worker connects directly to this
  // Postgres URL (typically Supabase's Supavisor pooler on port 6543) and
  // bypasses Hyperdrive. Use this to work around Hyperdrive daily-quota
  // outages. Set via: `wrangler secret put SUPABASE_DIRECT_URL`.
  SUPABASE_DIRECT_URL?: string;
  ENVIRONMENT?: string;
  // Supabase Auth Admin (Phase A). Server-only secrets used to provision staff
  // login accounts, reset passwords, and ban/unban users. Set via:
  //   wrangler secret put SUPABASE_SECRET_KEY
  // Use the modern Supabase secret key (prefixed `sb_secret_`); it works as a
  // drop-in for the legacy service_role key in the apikey/Authorization headers.
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};

type Variables = {
  db: DbClient;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function isLocalRequest(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function getDbFromHyperdrive(env: Bindings): DbClient {
  // Primary path: Hyperdrive (edge query cache + pooled connection).
  // Fallback path: SUPABASE_DIRECT_URL, used when either
  //   (a) the Hyperdrive binding is not present at all, or
  //   (b) the circuit breaker has tripped (see tripHyperdriveBreaker below)
  //       after a Hyperdrive-side failure such as a daily quota outage.
  const hyperdriveConn = env.HYPERDRIVE?.connectionString;
  const directConn = env.SUPABASE_DIRECT_URL;
  const useDirect =
    !!directConn && (!hyperdriveConn || isHyperdriveBreakerOpen());

  const conn = useDirect ? directConn : hyperdriveConn;
  if (!conn) {
    throw new Error(
      'No database connection available: HYPERDRIVE binding is missing and SUPABASE_DIRECT_URL is not set'
    );
  }

  // Request-scoped client prevents cross-request I/O object reuse in Workers.
  return createDb(conn);
}

// --- Hyperdrive circuit breaker (per-isolate) ----------------------------
// When Hyperdrive fails for a known-recoverable reason (daily quota, regional
// outage), trip the breaker so subsequent requests in this isolate skip
// Hyperdrive and route straight to Supabase via SUPABASE_DIRECT_URL. Auto
// resets at the next UTC midnight (when the free-tier quota also resets) or
// after 5 minutes, whichever is later. Each Worker isolate maintains its own
// breaker; there is no global coordination needed.
let hyperdriveDisabledUntilMs = 0;

function isHyperdriveBreakerOpen(): boolean {
  return Date.now() < hyperdriveDisabledUntilMs;
}

function isHyperdriveQuotaError(err: unknown): boolean {
  const own = String((err as any)?.message ?? '');
  const cause = String((err as any)?.cause?.message ?? (err as any)?.cause ?? '');
  const blob = `${own} ${cause}`.toLowerCase();
  // Cloudflare's Hyperdrive daily-quota message includes both phrases.
  return blob.includes('usage limit') || blob.includes('renews at');
}

function tripHyperdriveBreaker(reason: string): void {
  const now = Date.now();
  const nextMidnightUtc = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
    0, 0, 0
  );
  const until = Math.max(now + 5 * 60_000, nextMidnightUtc);
  // Only log the first trip; subsequent trips extend silently.
  if (until > hyperdriveDisabledUntilMs) {
    console.warn(
      `[HYPERDRIVE FALLBACK TRIPPED] Routing to SUPABASE_DIRECT_URL until ${new Date(until).toISOString()}. Reason: ${reason}`
    );
  }
  hyperdriveDisabledUntilMs = until;
}

const allowedCorsOrigins = new Set([
  'https://pumpos.app',
  'https://console.pumpos.app',
  'https://m.pumpos.app',
  'https://pumpos.abdullahnettoor.com',
  'https://console.pumpos.abdullahnettoor.com',
  'https://m.pumpos.abdullahnettoor.com',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]);

// Enable CORS for known browser/Tauri origins. Non-browser clients are not
// blocked by CORS; requests without an Origin header are allowed through.
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    return allowedCorsOrigins.has(origin) ? origin : null;
  },
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Server-Timing'],
  maxAge: 600,
}));

// Latency instrumentation: total per-request time as a Server-Timing header
// (visible in the browser Network tab) + a log line, so slow routes are obvious.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.header('Server-Timing', `app;dur=${ms}`);
  if (ms > 1000) console.warn(`[SLOW] ${c.req.method} ${new URL(c.req.url).pathname} ${ms}ms`);
});

// Setup Database instance middleware
app.use('*', async (c, next) => {
  try {
    c.set('db', getDbFromHyperdrive(c.env));
    await next();
  } catch (err: any) {
    return c.json({
      success: false,
      error: {
        code: 'CONFIGURATION_ERROR',
        message: err?.message || 'Database runtime configuration is invalid',
      },
    }, 500);
  }
});

// Public Health Check Endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'PumpOS API Layer',
  });
});

// Authenticated Routes Group
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth Middleware (validates JWT tokens issued by Supabase Auth)
api.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } }, 401);
  }

  const token = authHeader.split(' ')[1];
  let db = c.var.db;

  // Runs a DB access with a one-shot Hyperdrive→direct-URL fallback. If the
  // first attempt fails with a Hyperdrive-quota / usage-limit error and a
  // SUPABASE_DIRECT_URL is configured, we trip the per-isolate circuit
  // breaker, rebuild the request-scoped `db`, and retry via the direct URL.
  // All subsequent requests in this isolate will bypass Hyperdrive until the
  // breaker resets (at next UTC midnight or +5m, whichever is later).
  const runWithFallback = async <T>(fn: (client: DbClient) => Promise<T>): Promise<T> => {
    try {
      return await fn(db);
    } catch (dbErr) {
      if (isHyperdriveQuotaError(dbErr) && c.env.SUPABASE_DIRECT_URL) {
        tripHyperdriveBreaker((dbErr as any)?.message ?? String(dbErr));
        db = createDb(c.env.SUPABASE_DIRECT_URL);
        c.set('db', db);
        return await fn(db);
      }
      throw dbErr;
    }
  };

  try {
    let payload: any;



    // Verify token using JWT signature. Supabase's current recommendation is
    // asymmetric JWT signing (ES256) verified via the project's JWKS endpoint.
    // HS256 is kept only as an optional legacy fallback when the shared secret
    // is still configured.
    const { header, payload: decodedPayload } = decode(token);
    
    if (header.alg === 'HS256') {
      const secret = c.env.SUPABASE_JWT_SECRET;
      if (!secret) {
        throw new Error('Received legacy HS256 token but SUPABASE_JWT_SECRET is not configured. Enable asymmetric JWTs or set the legacy secret.');
      }
      payload = await verify(token, secret, 'HS256');
    } else if (header.alg === 'ES256') {
      const kid = header.kid;
      if (!kid) {
        throw new Error('Missing key ID (kid) in token header');
      }
      
      try {
        let publicKey = keyCache.get(kid);
        if (!publicKey) {
          const iss = decodedPayload.iss;
          if (!iss) {
            throw new Error('Missing issuer (iss) in token payload');
          }
          const jwksUrl = iss.endsWith('/') ? `${iss}.well-known/jwks.json` : `${iss}/.well-known/jwks.json`;
          console.log(`[JWT JWKS FETCH] Fetching JWKS from: ${jwksUrl}`);
          const response = await fetch(jwksUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch JWKS from ${jwksUrl}: ${response.statusText}`);
          }
          const jwks = await response.json() as { keys: any[] };
          const jwk = jwks.keys.find((k: any) => k.kid === kid);
          if (!jwk) {
            throw new Error(`Key with ID ${kid} not found in JWKS`);
          }
          publicKey = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
          );
          keyCache.set(kid, publicKey);
        }

        payload = await verify(token, publicKey, 'ES256');
      } catch (jwksError: any) {
        // Local-only fallback for workerd TLS trust chain issues when fetching JWKS.
        // Keep production strict by only permitting this in development/local environments
        // AND for localhost requests.
        const isDevelopment = c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'local';
        if (isDevelopment && isLocalRequest(c.req.url) && decodedPayload?.sub) {
          console.warn('[JWT DEV FALLBACK] JWKS fetch/verify failed locally; using decoded token claims only.', {
            reason: jwksError?.message || String(jwksError),
          });
          payload = decodedPayload;
        } else {
          throw jwksError;
        }
      }
    } else {
      throw new Error(`Unsupported algorithm: ${header.alg}`);
    }

    const authId = payload.sub; // UUID from supabase auth.users

    // Serve from the per-isolate auth cache when warm — skips the 2 DB
    // round-trips (users + userStationAssignments) that would otherwise fire
    // on every authenticated request.
    let cachedUser = getCachedAuthUser(authId);
    if (!cachedUser) {
      const dbUser = await runWithFallback((client) =>
        client.query.users.findFirst({
          where: eq(schema.users.authUserId, authId),
        })
      );

      if (!dbUser || dbUser.status === 'INACTIVE') {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'User profile inactive or not found' } }, 403);
      }

      const assigns = await runWithFallback((client) =>
        client
          .select()
          .from(schema.userStationAssignments)
          .where(eq(schema.userStationAssignments.userId, dbUser.id))
      );

      cachedUser = {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName ?? null,
        organizationId: dbUser.organizationId,
        role: dbUser.role as Role,
        assignedStationIds: assigns.map((a) => a.stationId),
      };
      setCachedAuthUser(authId, cachedUser);
    }

    c.set('user', cachedUser);

    await next();
  } catch (err: any) {
    const causeMessage = err.cause ? ` | Cause: ${err.cause.message || err.cause}` : '';
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Token validation failed: ${err.message}${causeMessage}`,
        stack: err.stack
      }
    }, 401);
  }
});

// GET /api/session - Return current session info
api.get('/session', (c) => {
  const user = c.var.user;
  return c.json({
    success: true,
    data: {
      user,
    },
  });
});

// GET /api/organization - current organization profile
api.get('/organization', async (c) => {
  const user = c.var.user;
  const db = c.var.db;
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, user.organizationId) });
  if (!org) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
  }
  return c.json({ success: true, data: org });
});

// PUT /api/organization - update org name + profile metadata (Owner only)
api.put('/organization', async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can manage the organization' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = organizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid input' } }, 400);
  }
  const db = c.var.db;
  const [updated] = await db
    .update(schema.organizations)
    .set({ name: parsed.data.name, metadata: parsed.data.metadata ?? {}, updatedAt: new Date() })
    .where(eq(schema.organizations.id, user.organizationId))
    .returning();
  return c.json({ success: true, data: updated });
});

// GET /api/activity - human-readable business-event activity feed (Owner only).
// (Named /activity rather than /events so ad-blockers don't block it.)
// Org-scoped; optional ?stationId= and ?type= filters, ?limit= (default 50, max 200).
api.get('/activity', async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can view the activity log' } }, 403);
  }
  const db = c.var.db;
  const stationId = c.req.query('stationId');
  const type = c.req.query('type');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const conds = [eq(schema.events.organizationId, user.organizationId)];
  if (stationId) conds.push(eq(schema.events.stationId, stationId));
  if (type) conds.push(eq(schema.events.eventType, type));
  const rows = await db
    .select({
      id: schema.events.id,
      eventType: schema.events.eventType,
      stationId: schema.events.stationId,
      stationName: schema.stations.name,
      aggregateType: schema.events.aggregateType,
      occurredAt: schema.events.occurredAt,
      recordedAt: schema.events.recordedAt,
      actorName: schema.users.fullName,
      payload: schema.events.payload,
    })
    .from(schema.events)
    .leftJoin(schema.stations, eq(schema.stations.id, schema.events.stationId))
    .leftJoin(schema.users, eq(schema.users.id, schema.events.actorId))
    .where(and(...conds))
    .orderBy(desc(schema.events.recordedAt))
    .limit(limit);
  return c.json({ success: true, data: rows });
});

// Idempotency: dedupe mutating requests that carry an Idempotency-Key header.
// Runs after auth (needs c.var.user) and skips GET/HEAD internally.
api.use('*', idempotency);

// Mount routes
api.route('/setup', stationSetupRouter);
api.route('/setup', paymentTerminalsRouter);
api.route('/setup', productsRouter);
api.route('/shifts', shiftsRouter);
api.route('/transactions', transactionsRouter);
api.route('/dssr', dssrRouter);
api.route('/finance', financeRouter);


// Mount authenticated group
app.route('/api', api);

export default app;
