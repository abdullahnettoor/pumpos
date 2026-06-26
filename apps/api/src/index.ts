import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify, decode } from 'hono/jwt';
import { createDb, DbClient, schema } from '@pump/db';
import { eq } from 'drizzle-orm';
import { Role } from '@pump/shared';
import { stationSetupRouter } from './routes/station-setup.js';
import { paymentTerminalsRouter } from './routes/payment-terminals.js';
import { productsRouter } from './routes/products.js';
// NOTE: shifts/transactions/dssr routes are temporarily disabled during the v2
// rewrite — they are rebuilt as core capability slices in Phases 3/6/7.
// import { shiftsRouter } from './routes/shifts.js';
// import { transactionsRouter } from './routes/transactions.js';
// import { dssrRouter } from './routes/dssr.js';


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
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function getDbFromHyperdrive(env: Bindings): DbClient {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Hyperdrive binding is missing or misconfigured');
  }

  return createDb(env.HYPERDRIVE.connectionString);
}

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

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

// Mount routes
api.route('/setup', stationSetupRouter);
api.route('/setup', paymentTerminalsRouter);
api.route('/setup', productsRouter);
// Disabled during v2 rewrite (rebuilt in later phases):
// api.route('/shifts', shiftsRouter);
// api.route('/transactions', transactionsRouter);
// api.route('/dssr', dssrRouter);


// Mount authenticated group
app.route('/api', api);

export default app;
