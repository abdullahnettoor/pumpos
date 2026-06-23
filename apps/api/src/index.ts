import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verify, decode } from 'hono/jwt';
import { createDb, DbClient, schema } from '@pump/db';
import { eq } from 'drizzle-orm';
import { Role } from '@pump/shared';
import { stationSetupRouter } from './routes/station-setup.js';
import { shiftsRouter } from './routes/shifts.js';
import { transactionsRouter } from './routes/transactions.js';


const keyCache = new Map<string, CryptoKey>();

type Bindings = {
  DATABASE_URL: string;
  DB_URL?: string;
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
  let dbUrl = c.env.DATABASE_URL || c.env.DB_URL || 'postgresql://abdullahnettoor@127.0.0.1:5432/pump_erp';
  if (dbUrl.includes('localhost')) {
    dbUrl = dbUrl.replace('localhost', '127.0.0.1');
  }
  if (!dbUrl.includes('@')) {
    dbUrl = dbUrl.replace('postgresql://', 'postgresql://abdullahnettoor@');
  }
  console.log(`[API DB CONNECTION] env keys: ${Object.keys(c.env || {})}, resolved dbUrl: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);
  const db = createDb(dbUrl);
  c.set('db', db);
  await next();
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

    // Resolve Role
    const roleRec = await db.query.userRoles.findFirst({
      where: eq(schema.userRoles.userId, dbUser.id),
    });
    const userRole = roleRec ? roleRec.role : 'Staff';

    // Resolve assignments
    const assigns = await db.select().from(schema.userStationAssignments).where(eq(schema.userStationAssignments.userId, dbUser.id));

    c.set('user', {
      id: dbUser.id,
      email: dbUser.email,
      organizationId: dbUser.organizationId,
      role: userRole as Role,
      assignedStationIds: assigns.map(a => a.stationId),
    });

    await next();
  } catch (err: any) {
    const dbUrl = c.env.DATABASE_URL || c.env.DB_URL || 'postgresql://postgres:postgres@localhost:5432/pump_erp';
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: `Token validation failed: ${err.message} | DB URL: ${dbUrl.replace(/:[^:@]+@/, ':***@')} | Keys: ${Object.keys(c.env || {})}`,
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
api.route('/shifts', shiftsRouter);
api.route('/transactions', transactionsRouter);


// Mount authenticated group
app.route('/api', api);

export default app;
