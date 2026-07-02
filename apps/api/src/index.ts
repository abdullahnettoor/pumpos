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
import { idempotency } from './infra/idempotency.js';


const keyCache = new Map<string, CryptoKey>();

type Bindings = {
  HYPERDRIVE: Hyperdrive;
  SUPABASE_JWT_SECRET: string;
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
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Hyperdrive binding is missing or misconfigured');
  }

  // Request-scoped client prevents cross-request I/O object reuse in Workers.
  return createDb(env.HYPERDRIVE.connectionString);
}

// Enable CORS
app.use('*', cors({
  origin: '*',
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

  const secret = c.env.SUPABASE_JWT_SECRET || 'placeholder-jwt-secret-replace-in-prod';
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } }, 401);
  }

  const token = authHeader.split(' ')[1];
  const db = c.var.db;

  try {
    let payload: any;



    // Verify token using JWT signature
    const { header, payload: decodedPayload } = decode(token);
    
    if (header.alg === 'HS256') {
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
          console.log(`[JWT JWKS CACHE] Imported and cached public key for kid: ${kid}`);
        }

        payload = await verify(token, publicKey, 'ES256');
      } catch (jwksError: any) {
        // Local-only fallback for workerd TLS trust chain issues when fetching JWKS.
        // Keep production strict by only permitting this on localhost requests.
        if (isLocalRequest(c.req.url) && decodedPayload?.sub) {
          console.warn('[JWT DEV FALLBACK] JWKS fetch/verify failed locally; using decoded token claims only.', {
            reason: jwksError?.message || String(jwksError),
          });
          payload = decodedPayload;
        } else {
          throw jwksError;
        }
      }
    } else {
      throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
    }
    const authId = payload.sub; // UUID from supabase auth.users

    // Resolve user from DB
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.authUserId, authId),
    });

    if (!dbUser || dbUser.status === 'INACTIVE') {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'User profile inactive or not found' } }, 403);
    }

    // Resolve assignments
    const assigns = await db.select().from(schema.userStationAssignments).where(eq(schema.userStationAssignments.userId, dbUser.id));

    c.set('user', {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName ?? null,
      organizationId: dbUser.organizationId,
      role: dbUser.role as Role,
      assignedStationIds: assigns.map(a => a.stationId),
    });

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


// Mount authenticated group
app.route('/api', api);

export default app;
