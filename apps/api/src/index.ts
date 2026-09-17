import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb, DbClient, schema } from '@pump/db';
import {
  eq,
  and,
  asc,
  desc,
  inArray,
  count,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Role, canManageUsers, organizationUpdateSchema } from '@pump/shared';
import {
  BusinessEvents,
  SystemClock,
  UuidGenerator,
  createEvent,
  type DomainEvent,
  type EventTone,
} from '@pump/core';
import { stationSetupRouter } from './routes/station-setup.js';
import { paymentTerminalsRouter } from './routes/payment-terminals.js';
import { productsRouter } from './routes/products.js';
import { shiftsRouter } from './routes/shifts.js';
import { transactionsRouter } from './routes/transactions.js';
import { dssrRouter } from './routes/dssr.js';
import { financeRouter } from './routes/finance.js';
import { idempotency } from './infra/idempotency.js';
import { verifySupabaseJwt } from './infra/supabase-jwt.js';
import { SupabaseAdmin } from './infra/supabase-admin.js';
import { DrizzleEventStore } from './infra/events.js';
import { rateLimit } from './infra/rate-limit.js';
import { resolveCorsOrigin } from './infra/cors.js';
import type { AuthenticatedPrincipal } from './infra/authenticated-principal.js';
import {
  readActivityMetadata,
  renderActivityFallback,
  resolveActivityActor,
  type ActivityActor,
  type ActivityGroupingRole,
} from './infra/activity.js';

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
  // Platform back-office (Phase A / A3). Comma-separated allow-list of platform
  // admin emails permitted to call /platform/* routes (owner provisioning).
  // Emails aren't secret, so this is a plaintext [vars] entry. Callers still
  // present a valid Supabase JWT; the email claim must be in this list.
  PLATFORM_ADMIN_EMAILS?: string;
  // Optional destination for owner-invite links (must be in the Supabase
  // redirect allow-list). When unset, Supabase falls back to the Site URL.
  INVITE_REDIRECT_URL?: string;
};

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
  platformAdmin: {
    email: string;
    subjectId: string | null;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function getDbFromHyperdrive(env: Bindings): DbClient {
  // Primary path: Hyperdrive (edge query cache + pooled connection).
  // Fallback path: SUPABASE_DIRECT_URL, used when either
  //   (a) the Hyperdrive binding is not present at all, or
  //   (b) the circuit breaker has tripped (see tripHyperdriveBreaker below)
  //       after a Hyperdrive-side failure such as a daily quota outage.
  const hyperdriveConn = env.HYPERDRIVE?.connectionString;
  const directConn = env.SUPABASE_DIRECT_URL;
  const useDirect = !!directConn && (!hyperdriveConn || isHyperdriveBreakerOpen());

  const conn = useDirect ? directConn : hyperdriveConn;
  if (!conn) {
    throw new Error(
      'No database connection available: HYPERDRIVE binding is missing and SUPABASE_DIRECT_URL is not set',
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
    0,
    0,
    0,
  );
  const until = Math.max(now + 5 * 60_000, nextMidnightUtc);
  // Only log the first trip; subsequent trips extend silently.
  if (until > hyperdriveDisabledUntilMs) {
    console.warn(
      `[HYPERDRIVE FALLBACK TRIPPED] Routing to SUPABASE_DIRECT_URL until ${new Date(until).toISOString()}. Reason: ${reason}`,
    );
  }
  hyperdriveDisabledUntilMs = until;
}

// Enable CORS for known browser/Tauri origins. Non-browser clients are not
// blocked by CORS; requests without an Origin header are allowed through.
// The decision lives in `infra/cors.ts` so it can be tested directly.
app.use(
  '*',
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.env),
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'Server-Timing'],
    maxAge: 600,
  }),
);

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
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: err?.message || 'Database runtime configuration is invalid',
        },
      },
      500,
    );
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

type ActivityEventRow = {
  eventId: string;
  eventType: string;
  stationId: string | null;
  stationName: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  recordedAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  correlationId: string | null;
  causationId: string | null;
  metadata: unknown;
};

interface ActivityEvent {
  eventId: string;
  eventType: string;
  stationId: string | null;
  stationName: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  recordedAt: Date;
  correlationId: string | null;
  causationId: string | null;
  groupingRole: ActivityGroupingRole | null;
  actor: ActivityActor;
  title: string;
  description: string;
  tone: EventTone;
  renderStatus: 'rendered' | 'fallback';
}

interface ActivityGroupSummary {
  groupId: string;
  primary: ActivityEvent;
  relatedCount: number;
  primaryRecordedAt: Date;
  isLegacy: boolean;
}

interface ActivityPage {
  items: ActivityGroupSummary[];
  nextCursor: string | null;
}

interface ActivityGroupDetail extends ActivityGroupSummary {
  related: ActivityEvent[];
}

interface ActivityCursor {
  recordedAt: Date;
  eventId: string;
}

const ACTIVITY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const activityEventFields = {
  eventId: schema.events.eventId,
  eventType: schema.events.eventType,
  stationId: schema.events.stationId,
  stationName: schema.stations.name,
  aggregateType: schema.events.aggregateType,
  aggregateId: schema.events.aggregateId,
  occurredAt: schema.events.occurredAt,
  recordedAt: schema.events.recordedAt,
  actorId: schema.events.actorId,
  actorName: schema.users.fullName,
  actorEmail: schema.users.email,
  correlationId: schema.events.correlationId,
  causationId: schema.events.causationId,
  metadata: schema.events.metadata,
};

function encodeActivityCursor(row: Pick<ActivityEventRow, 'recordedAt' | 'eventId'>): string {
  return btoa(JSON.stringify({ recordedAt: row.recordedAt.toISOString(), eventId: row.eventId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeActivityCursor(value: string | undefined): ActivityCursor | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Malformed activity cursor');
  }

  try {
    const padded = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const decoded: unknown = JSON.parse(atob(padded));
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      Array.isArray(decoded) ||
      typeof (decoded as Record<string, unknown>).recordedAt !== 'string' ||
      typeof (decoded as Record<string, unknown>).eventId !== 'string'
    ) {
      throw new Error('Malformed activity cursor');
    }
    const recordedAt = new Date((decoded as Record<string, string>).recordedAt);
    const eventId = (decoded as Record<string, string>).eventId;
    if (Number.isNaN(recordedAt.getTime()) || !ACTIVITY_UUID_PATTERN.test(eventId)) {
      throw new Error('Malformed activity cursor');
    }
    return { recordedAt, eventId };
  } catch {
    throw new Error('Malformed activity cursor');
  }
}

function parseActivityLimit(value: string | undefined): number {
  if (!value) return 50;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('limit must be a positive integer');
  }
  return Math.min(Number(value), 200);
}

function isValidActivityGroupId(value: string): boolean {
  return ACTIVITY_UUID_PATTERN.test(value);
}

function formatActivityEvent(row: ActivityEventRow, isLegacy = false): ActivityEvent {
  const metadata = readActivityMetadata(row.metadata);
  const rendered = renderActivityFallback({ eventType: row.eventType, metadata: row.metadata });
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    stationId: row.stationId,
    stationName: row.stationName,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    correlationId: row.correlationId,
    causationId: row.causationId,
    groupingRole: isLegacy ? 'primary' : metadata.groupingRole,
    actor: resolveActivityActor(row.metadata, row.actorId, {
      fullName: row.actorName,
      email: row.actorEmail,
    }),
    title: rendered.title,
    description: rendered.description,
    tone: rendered.tone,
    renderStatus: rendered.renderStatus,
  };
}

function activityGroupFilter(
  organizationId: string,
  stationId: string | undefined,
  type: string | undefined,
): SQL | undefined {
  if (!stationId && !type) return undefined;

  const stationFilter = stationId
    ? sql` AND activity_group_members.station_id = ${stationId}`
    : sql``;
  const typeFilter = type ? sql` AND activity_group_members.event_type = ${type}` : sql``;
  return sql`EXISTS (
    SELECT 1
    FROM events AS activity_group_members
    WHERE activity_group_members.organization_id = ${organizationId}
      AND (
        (${schema.events.correlationId} IS NOT NULL
          AND activity_group_members.correlation_id = ${schema.events.correlationId})
        OR
        (${schema.events.correlationId} IS NULL
          AND activity_group_members.event_id = ${schema.events.eventId})
      )
      ${stationFilter}
      ${typeFilter}
  )`;
}

function activityJoins(organizationId: string) {
  return {
    station: and(
      eq(schema.stations.id, schema.events.stationId),
      eq(schema.stations.organizationId, organizationId),
    ),
    actor: and(
      eq(schema.users.id, schema.events.actorId),
      eq(schema.users.organizationId, organizationId),
    ),
  };
}

// Auth Middleware (validates JWT tokens issued by Supabase Auth)
api.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' },
      },
      401,
    );
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
    // Verify token using JWT signature. Supabase's current recommendation is
    // asymmetric JWT signing (ES256) verified via the project's JWKS endpoint.
    // HS256 is kept only as an optional legacy fallback when the shared secret
    // is still configured.
    const payload: any = await verifySupabaseJwt(token, c.env, c.req.url);

    const authId = payload.sub; // UUID from supabase auth.users

    // Serve from the per-isolate auth cache when warm — skips the 2 DB
    // round-trips (users + userStationAssignments) that would otherwise fire
    // on every authenticated request.
    let cachedUser = getCachedAuthUser(authId);
    if (!cachedUser) {
      const dbUser = await runWithFallback((client) =>
        client.query.users.findFirst({
          where: eq(schema.users.authUserId, authId),
        }),
      );

      if (!dbUser || dbUser.status === 'INACTIVE') {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'User profile inactive or not found' },
          },
          403,
        );
      }

      const assigns = await runWithFallback((client) =>
        client
          .select()
          .from(schema.userStationAssignments)
          .where(eq(schema.userStationAssignments.userId, dbUser.id)),
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
    // Never expose internal error details (messages, causes, stacks) to the
    // caller — log them server-side and return a fixed envelope.
    console.error('[AUTH] Token validation failed', {
      message: err?.message,
      cause: err?.cause?.message ?? err?.cause,
    });
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired authentication token',
        },
      },
      401,
    );
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
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, user.organizationId),
  });
  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }
  return c.json({ success: true, data: org });
});

// PUT /api/organization - update org name + profile metadata (Owner only)
api.put('/organization', async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Owners can manage the organization' },
      },
      403,
    );
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = organizationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid input',
        },
      },
      400,
    );
  }
  const db = c.var.db;
  const [updated] = await db
    .update(schema.organizations)
    .set({ name: parsed.data.name, metadata: parsed.data.metadata ?? {}, updatedAt: new Date() })
    .where(eq(schema.organizations.id, user.organizationId))
    .returning();
  return c.json({ success: true, data: updated });
});

// GET /api/activity - human-readable business-event activity groups (Owner only).
// (Named /activity rather than /events so ad-blockers don't block it.)
api.get('/activity', async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Owners can view the activity log' },
      },
      403,
    );
  }
  const stationId = c.req.query('stationId');
  const type = c.req.query('type');
  let limit: number;
  let cursor: ActivityCursor | null;
  try {
    limit = parseActivityLimit(c.req.query('limit'));
    cursor = decodeActivityCursor(c.req.query('cursor'));
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Invalid activity query',
        },
      },
      400,
    );
  }

  const primaryRole = sql`${schema.events.metadata} -> 'grouping' ->> 'role'`;
  const conds: SQL[] = [
    eq(schema.events.organizationId, user.organizationId),
    or(
      isNull(schema.events.correlationId),
      and(isNotNull(schema.events.correlationId), eq(primaryRole, 'primary')),
    )!,
  ];
  const memberFilter = activityGroupFilter(user.organizationId, stationId, type);
  if (memberFilter) conds.push(memberFilter);
  if (cursor) {
    conds.push(
      or(
        lt(schema.events.recordedAt, cursor.recordedAt),
        and(
          eq(schema.events.recordedAt, cursor.recordedAt),
          lt(schema.events.eventId, cursor.eventId),
        ),
      )!,
    );
  }

  const joins = activityJoins(user.organizationId);
  const relatedCount = sql<number>`CASE
    WHEN ${schema.events.correlationId} IS NULL THEN 0
    ELSE (
      SELECT count(*) - 1
      FROM events AS activity_group_members
      WHERE activity_group_members.organization_id = ${user.organizationId}
        AND activity_group_members.correlation_id = ${schema.events.correlationId}
    )
  END`
    .mapWith(Number)
    .as('related_count');

  const rows = await c.var.db
    .select({ ...activityEventFields, relatedCount })
    .from(schema.events)
    .leftJoin(schema.stations, joins.station)
    .leftJoin(schema.users, joins.actor)
    .where(and(...conds))
    .orderBy(desc(schema.events.recordedAt), desc(schema.events.eventId))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const data: ActivityPage = {
    items: pageRows.map((row) => {
      const isLegacy = row.correlationId === null;
      return {
        groupId: row.correlationId ?? row.eventId,
        primary: formatActivityEvent(row, isLegacy),
        relatedCount: row.relatedCount,
        primaryRecordedAt: row.recordedAt,
        isLegacy,
      };
    }),
    nextCursor:
      hasMore && pageRows.length > 0 ? encodeActivityCursor(pageRows[pageRows.length - 1]) : null,
  };
  return c.json({ success: true, data });
});

// GET /api/activity/:groupId - one grouped command, including lazy siblings.
api.get('/activity/:groupId', async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only Owners can view the activity log' },
      },
      403,
    );
  }
  const groupId = c.req.param('groupId');
  if (!isValidActivityGroupId(groupId)) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid activity group ID' } },
      400,
    );
  }

  const joins = activityJoins(user.organizationId);
  const selectActivityRows = (where: SQL) =>
    c.var.db
      .select(activityEventFields)
      .from(schema.events)
      .leftJoin(schema.stations, joins.station)
      .leftJoin(schema.users, joins.actor)
      .where(where)
      .orderBy(asc(schema.events.occurredAt), asc(schema.events.eventId));

  let rows = await selectActivityRows(
    and(
      eq(schema.events.organizationId, user.organizationId),
      eq(schema.events.correlationId, groupId),
    )!,
  );
  let isLegacy = false;
  if (rows.length === 0) {
    isLegacy = true;
    rows = await selectActivityRows(
      and(
        eq(schema.events.organizationId, user.organizationId),
        eq(schema.events.eventId, groupId),
        isNull(schema.events.correlationId),
      )!,
    );
  }
  if (rows.length === 0) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Activity group not found' } },
      404,
    );
  }

  const primaryRow = isLegacy
    ? rows[0]
    : rows.find((row) => readActivityMetadata(row.metadata).groupingRole === 'primary');
  if (!primaryRow) {
    console.warn('[ACTIVITY_MALFORMED_GROUP] Correlated activity group has no primary event', {
      organizationId: user.organizationId,
      correlationId: groupId,
    });
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Activity group not found' } },
      404,
    );
  }

  const data: ActivityGroupDetail = {
    groupId,
    primary: formatActivityEvent(primaryRow, isLegacy),
    relatedCount: rows.length - 1,
    primaryRecordedAt: primaryRow.recordedAt,
    related: rows
      .filter((row) => row.eventId !== primaryRow.eventId)
      .map((row) => formatActivityEvent(row)),
    isLegacy,
  };
  return c.json({ success: true, data });
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

// ---------------------------------------------------------------------------
// Platform back-office group (A3). Separate from the tenant `/api` group and
// mounted OUTSIDE its auth middleware, because platform admins have no
// `public.users` row and would be rejected by the tenant lookup. Its guard
// verifies the Supabase JWT and checks the email claim against the
// PLATFORM_ADMIN_EMAILS allow-list. No org/role resolution.
// ---------------------------------------------------------------------------
const platform = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Blunt brute-force / invite-spam bursts before the JWT + allow-list checks.
platform.use('*', rateLimit({ scope: 'platform', max: 20, windowMs: 60_000 }));

platform.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return await next();
  }
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' },
      },
      401,
    );
  }
  const token = authHeader.split(' ')[1];
  let payload: any;
  try {
    payload = await verifySupabaseJwt(token, c.env, c.req.url);
  } catch (err: any) {
    console.error('[PLATFORM AUTH] Token validation failed', { message: err?.message });
    return c.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token' },
      },
      401,
    );
  }
  const email = String(payload?.email ?? '')
    .trim()
    .toLowerCase();
  const allow = (c.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!email || allow.length === 0 || !allow.includes(email)) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Not a platform administrator' } },
      403,
    );
  }
  c.set('platformAdmin', {
    email,
    subjectId: typeof payload?.sub === 'string' && payload.sub.trim() ? payload.sub : null,
  });
  await next();
});

// POST /platform/owners/invite — provision a fuel-station owner + bootstrap
// their org. Two modes drive the gated `handle_new_user()` trigger (which
// creates the organization + Owner `public.users` row and links
// `auth_user_id`):
//   - default (email invite): Resend-backed link; the owner sets their own
//     password via /accept-invite. No password crosses the wire.
//   - password mode (`mode: 'password'`, no-SMTP fallback): create a verified
//     account with an owner-set/generated password and return the credentials
//     to hand over. Use when email delivery is unavailable.
platform.post('/owners/invite', async (c) => {
  const admin =
    c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY
      ? new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY })
      : null;
  if (!admin) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Auth provisioning is not configured on the server',
        },
      },
      500,
    );
  }
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(body?.fullName ?? '').trim();
  const organizationName = String(body?.organizationName ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'A valid email is required' } },
      400,
    );
  }
  if (fullName.length < 2 || organizationName.length < 2) {
    return c.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'fullName and organizationName are required' },
      },
      400,
    );
  }
  const ownerMetadata = {
    signup_intent: 'owner',
    organization_name: organizationName,
    full_name: fullName,
    role: 'Owner',
  };

  // No-SMTP fallback: create a verified account with a password and return it.
  const passwordMode = body?.mode === 'password' || typeof body?.password === 'string';
  if (passwordMode) {
    const password =
      typeof body?.password === 'string' && body.password.trim()
        ? String(body.password)
        : generateOwnerPassword();
    if (password.length < 8) {
      return c.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Password must be at least 8 characters' },
        },
        400,
      );
    }
    try {
      const created = await admin.createUser({
        email,
        password,
        userMetadata: ownerMetadata,
        // Server-set authority for the gated handle_new_user() owner branch
        // (admin-created accounts have no invited_at).
        appMetadata: { signup_intent: 'owner' },
      });
      return c.json({ success: true, data: { authUserId: created.id, email, password } });
    } catch (e: any) {
      const status = e?.status === 422 ? 409 : 400;
      return c.json(
        {
          success: false,
          error: { code: 'PROVISION_FAILED', message: e?.message ?? 'Could not provision owner' },
        },
        status,
      );
    }
  }

  try {
    const invited = await admin.inviteUserByEmail(email, {
      redirectTo: c.env.INVITE_REDIRECT_URL,
      data: ownerMetadata,
    });
    // GoTrue may write invited_at and user metadata in either order. App metadata
    // is server-controlled and gives the provisioning trigger a safe retry signal.
    await admin.updateAppMetadata(invited.id, {
      signup_intent: 'owner',
      organization_name: organizationName,
    });
    return c.json({ success: true, data: { authUserId: invited.id, email } });
  } catch (e: any) {
    const status = e?.status === 422 ? 409 : 400;
    return c.json(
      {
        success: false,
        error: { code: 'INVITE_FAILED', message: e?.message ?? 'Could not send invite' },
      },
      status,
    );
  }
});

// ---------------------------------------------------------------------------
// Platform back-office: list + row actions on owners (Phase A / Option 1).
//
// The list joins organizations + their Owner `public.users` row + station
// counts, then augments each row with the Supabase auth state (invite
// accepted, banned, last sign-in). N is small (# of orgs), so per-owner
// Supabase reads are fine.
// ---------------------------------------------------------------------------

// Generate a strong, human-transcribable owner password (ambiguous chars
// excluded). Used by the no-SMTP password mode when none is supplied.
function generateOwnerPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let out = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 9; i++) out += pick(all);
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

async function appendPlatformEvent(db: DbClient, event: DomainEvent<any, unknown>): Promise<void> {
  await new DrizzleEventStore(db).append([event]);
}

function buildPlatformEvent<TType extends string, TPayload>(
  eventType: TType,
  organizationId: string,
  aggregateId: string,
  payload: TPayload,
  actor: Variables['platformAdmin'],
): DomainEvent<TType, TPayload> {
  const ids = new UuidGenerator();
  return createEvent<TType, TPayload>(
    {
      eventType,
      aggregateType: 'organization',
      aggregateId,
      payload,
      organizationId,
      actorId: null,
      correlationId: ids.newId(),
      metadata: {
        platformActorEmail: actor.email,
        grouping: { role: 'primary' },
        actorSnapshot: {
          kind: 'platform_admin',
          displayName: actor.email,
          role: 'Platform Admin',
          subjectId: actor.subjectId,
        },
      },
    },
    { ids, clock: new SystemClock() },
  );
}

type OwnerStatus = 'invited' | 'active' | 'deactivated' | 'unlinked' | 'unknown';

function deriveOwnerStatus(
  userStatus: string,
  authUser: {
    email_confirmed_at?: string | null;
    banned_until?: string | null;
    last_sign_in_at?: string | null;
  } | null,
): OwnerStatus {
  if (userStatus === 'INACTIVE') return 'deactivated';
  if (!authUser) return 'unlinked';
  const bannedUntilMs = authUser.banned_until ? Date.parse(authUser.banned_until) : 0;
  if (bannedUntilMs && bannedUntilMs > Date.now()) return 'deactivated';
  if (authUser.email_confirmed_at || authUser.last_sign_in_at) return 'active';
  return 'invited';
}

// GET /platform/owners — one row per org (its Owner user), enriched with auth
// state. Revoked orgs are hidden by default; pass ?includeRevoked=1 to show them.
platform.get('/owners', async (c) => {
  const db = c.var.db;
  const includeRevoked = ['1', 'true', 'yes'].includes(
    (c.req.query('includeRevoked') ?? '').toLowerCase(),
  );
  // Pull all orgs + their Owner user (there is exactly one Owner per org in the
  // current model; if a legacy org has 0 or >1 Owners we still show it).
  const allOrgs = await db
    .select()
    .from(schema.organizations)
    .orderBy(desc(schema.organizations.createdAt));
  const orgs = includeRevoked ? allOrgs : allOrgs.filter((o) => o.subscriptionStatus !== 'Revoked');
  if (orgs.length === 0) {
    return c.json({ success: true, data: [] });
  }
  const orgIds = orgs.map((o) => o.id);
  const owners = await db
    .select()
    .from(schema.users)
    .where(and(inArray(schema.users.organizationId, orgIds), eq(schema.users.role, 'Owner')));
  const stationRows = await db
    .select({
      organizationId: schema.stations.organizationId,
      onboardingStatus: schema.stations.onboardingStatus,
      isActive: schema.stations.isActive,
    })
    .from(schema.stations)
    .where(inArray(schema.stations.organizationId, orgIds));

  const ownersByOrg = new Map<string, (typeof owners)[number]>();
  for (const u of owners) {
    // If multiple Owner rows exist, prefer the linked (authUserId set) one.
    const prev = ownersByOrg.get(u.organizationId);
    if (!prev || (!prev.authUserId && u.authUserId)) ownersByOrg.set(u.organizationId, u);
  }
  const stationCounts = new Map<string, { total: number; ready: number }>();
  for (const s of stationRows) {
    const bucket = stationCounts.get(s.organizationId) ?? { total: 0, ready: 0 };
    bucket.total += 1;
    if (s.onboardingStatus === 'READY_FOR_OPERATIONS' && s.isActive) bucket.ready += 1;
    stationCounts.set(s.organizationId, bucket);
  }

  const admin =
    c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY
      ? new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY })
      : null;

  const data = await Promise.all(
    orgs.map(async (org) => {
      const owner = ownersByOrg.get(org.id) ?? null;
      let authUser: Awaited<ReturnType<SupabaseAdmin['getUserById']>> | null = null;
      if (admin && owner?.authUserId) {
        try {
          authUser = await admin.getUserById(owner.authUserId);
        } catch {
          authUser = null;
        }
      }
      const stations = stationCounts.get(org.id) ?? { total: 0, ready: 0 };
      return {
        organizationId: org.id,
        organizationName: org.name,
        subscriptionPlan: org.subscriptionPlan,
        subscriptionStatus: org.subscriptionStatus,
        createdAt: org.createdAt,
        owner: owner
          ? {
              userId: owner.id,
              authUserId: owner.authUserId,
              email: owner.email,
              fullName: owner.fullName,
              userStatus: owner.status,
              emailConfirmedAt: authUser?.email_confirmed_at ?? null,
              invitedAt: authUser?.invited_at ?? null,
              lastSignInAt: authUser?.last_sign_in_at ?? null,
              bannedUntil: authUser?.banned_until ?? null,
              status: deriveOwnerStatus(owner.status, authUser),
            }
          : null,
        stationCount: stations.total,
        readyStationCount: stations.ready,
      };
    }),
  );

  return c.json({ success: true, data });
});

// Resolve an org id + its Owner (must be linked to auth) for a row-action route.
async function loadOwnerForOrg(db: DbClient, orgId: string) {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  if (!org) return { org: null, owner: null };
  const [owner] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'Owner')))
    .orderBy(desc(schema.users.createdAt))
    .limit(1);
  return { org, owner: owner ?? null };
}

// "Has the owner actually used the account?" — the only reliable cross-mode
// signal is a real sign-in. `email_confirmed_at` is set immediately for the
// no-SMTP password mode (createUser + email_confirm), so it cannot distinguish
// a never-used password owner from an accepted email invite; `last_sign_in_at`
// can. resend/revoke are refused only once the owner has signed in.
function ownerHasSignedIn(authUser: { last_sign_in_at?: string | null } | null): boolean {
  return !!authUser?.last_sign_in_at;
}

// POST /platform/owners/:orgId/resend — re-send the invite email. Only useful
// while the owner has not signed in; refuse once they have.
platform.post('/owners/:orgId/resend', async (c) => {
  const admin =
    c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY
      ? new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY })
      : null;
  if (!admin) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Auth provisioning is not configured on the server',
        },
      },
      500,
    );
  }
  const orgId = c.req.param('orgId');
  const { org, owner } = await loadOwnerForOrg(c.var.db, orgId);
  if (!org || !owner) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization or owner not found' } },
      404,
    );
  }
  if (!owner.email) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Owner has no email on file' } },
      400,
    );
  }
  if (owner.authUserId) {
    const authUser = await admin.getUserById(owner.authUserId);
    if (ownerHasSignedIn(authUser)) {
      return c.json(
        {
          success: false,
          error: { code: 'ALREADY_ACCEPTED', message: 'Owner has already signed in' },
        },
        409,
      );
    }
    // Delete the pending auth user so the re-invite goes through cleanly
    // (Supabase 422s on re-invite for an existing auth user).
    try {
      await admin.deleteUser(owner.authUserId);
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: 'INVITE_FAILED', message: e?.message ?? 'Could not clear pending invite' },
        },
        400,
      );
    }
  }
  try {
    const invited = await admin.inviteUserByEmail(owner.email, {
      redirectTo: c.env.INVITE_REDIRECT_URL,
      data: {
        signup_intent: 'owner',
        organization_name: org.name,
        full_name: owner.fullName,
        role: 'Owner',
      },
    });
    // The gated handle_new_user() trigger only fires on brand-new orgs; the
    // profile row already exists, so link the new auth id back to it here.
    await c.var.db
      .update(schema.users)
      .set({ authUserId: invited.id, updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id));
    await appendPlatformEvent(
      c.var.db,
      buildPlatformEvent(
        BusinessEvents.OWNER_INVITE_RESENT,
        org.id,
        owner.id,
        { email: owner.email },
        c.var.platformAdmin,
      ),
    );
    return c.json({ success: true, data: { authUserId: invited.id, email: owner.email } });
  } catch (e: any) {
    return c.json(
      {
        success: false,
        error: { code: 'INVITE_FAILED', message: e?.message ?? 'Could not send invite' },
      },
      400,
    );
  }
});

// POST /platform/owners/:orgId/revoke — cancel a never-signed-in owner invite.
// Deletes the pending Supabase auth user (so the invite/credentials can no
// longer be used), then SOFT-cancels the org: marks it `Revoked` and the owner
// `INACTIVE` (per AGENTS.md we avoid physical deletion — historical data and
// the audit event are preserved). Refused once the owner has signed in or if
// any station has been onboarded.
platform.post('/owners/:orgId/revoke', async (c) => {
  const admin =
    c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY
      ? new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY })
      : null;
  const db = c.var.db;
  const orgId = c.req.param('orgId');
  const { org, owner } = await loadOwnerForOrg(db, orgId);
  if (!org) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } },
      404,
    );
  }
  // Refuse if any station already exists — operator data must not be touched.
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.stations)
    .where(eq(schema.stations.organizationId, orgId));
  if (Number(n) > 0) {
    return c.json(
      {
        success: false,
        error: {
          code: 'ORG_NOT_EMPTY',
          message: 'Organization has stations; use deactivate instead of revoke',
        },
      },
      409,
    );
  }
  if (owner?.authUserId && admin) {
    const authUser = await admin.getUserById(owner.authUserId);
    if (ownerHasSignedIn(authUser)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ALREADY_ACCEPTED',
            message: 'Owner has already signed in; use deactivate instead of revoke',
          },
        },
        409,
      );
    }
    try {
      await admin.deleteUser(owner.authUserId);
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: {
            code: 'AUTH_DELETE_FAILED',
            message: e?.message ?? 'Could not delete auth user',
          },
        },
        400,
      );
    }
  }
  // Soft-cancel: keep rows (+ audit) but make the invite dead and drop it from
  // the active list. Clearing authUserId lets the same email be re-invited.
  if (owner) {
    await db
      .update(schema.users)
      .set({ status: 'INACTIVE', authUserId: null, updatedAt: new Date() })
      .where(eq(schema.users.id, owner.id));
  }
  await db
    .update(schema.organizations)
    .set({ subscriptionStatus: 'Revoked', updatedAt: new Date() })
    .where(eq(schema.organizations.id, org.id));
  await appendPlatformEvent(
    db,
    buildPlatformEvent(
      BusinessEvents.OWNER_INVITE_REVOKED,
      org.id,
      owner?.id ?? org.id,
      { organizationName: org.name, email: owner?.email ?? null },
      c.var.platformAdmin,
    ),
  );
  return c.json({ success: true, data: { organizationId: org.id, revoked: true } });
});

async function setOwnerActive(c: any, active: boolean): Promise<Response> {
  const admin =
    c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY
      ? new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY })
      : null;
  const db = c.var.db as DbClient;
  const orgId = c.req.param('orgId');
  const { org, owner } = await loadOwnerForOrg(db, orgId);
  if (!org || !owner) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Organization or owner not found' } },
      404,
    );
  }
  if (owner.authUserId && admin) {
    try {
      if (active) await admin.unbanUser(owner.authUserId);
      else await admin.banUser(owner.authUserId);
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: {
            code: 'AUTH_BAN_FAILED',
            message: e?.message ?? 'Could not update login account',
          },
        },
        400,
      );
    }
  }
  await db
    .update(schema.users)
    .set({ status: active ? 'ACTIVE' : 'INACTIVE', updatedAt: new Date() })
    .where(eq(schema.users.id, owner.id));
  await db
    .update(schema.organizations)
    .set({ subscriptionStatus: active ? 'Active' : 'Deactivated', updatedAt: new Date() })
    .where(eq(schema.organizations.id, org.id));
  await appendPlatformEvent(
    db,
    buildPlatformEvent(
      active ? BusinessEvents.ORGANIZATION_REACTIVATED : BusinessEvents.ORGANIZATION_DEACTIVATED,
      org.id,
      org.id,
      { organizationName: org.name, ownerEmail: owner.email },
      c.var.platformAdmin,
    ),
  );
  return c.json({ success: true, data: { organizationId: org.id, active } });
}

platform.post('/owners/:orgId/deactivate', (c) => setOwnerActive(c, false));
platform.post('/owners/:orgId/reactivate', (c) => setOwnerActive(c, true));

app.route('/platform', platform);

export default app;
