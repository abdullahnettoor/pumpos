import type { Context } from 'hono';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { isAuthorizedForStation, isOwner, isValidBusinessDate } from '@pump/shared';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import {
  OFFICE_ACTIVITY_EVENTS,
  businessDayWindow,
  dashboardEventTypesForRole,
  entryDateWindow,
} from '../infra/activity-day.js';
import {
  activityEventFields,
  activityJoins,
  formatActivityEvent,
  type ActivityGroupSummary,
} from '../infra/activity-events.js';
import { findStationClock, stationNotFound } from '../infra/station-clock.js';

type Env = { Variables: { db: DbClient; user: AuthenticatedPrincipal } };

/**
 * GET /activity?stationId=&date=[&entryDate=] — one Business Day's Activity Groups, oldest
 * first, role-filtered on the server. Two statements however many events: the
 * station clock lookup and one grouped events query.
 *
 * Office Records are placed by their payload Entry Date (`entryDate`, default
 * `date`), falling back to the station calendar-day window of occurredAt when
 * the payload carries none; the rest by the Business Day window (ADR 0005).
 */
export const activityDayHandler = async (c: Context<Env>) => {
  const date = c.req.query('date') as string;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const bad = (message: string) =>
    c.json({ success: false, error: { code: 'VALIDATION_ERROR', message } }, 400);
  if (!stationId) return bad('Missing stationId');
  if (!isValidBusinessDate(date)) return bad('date must be a valid YYYY-MM-DD date');
  const entryDate = c.req.query('entryDate') ?? date;
  if (!isValidBusinessDate(entryDate)) return bad('entryDate must be a valid YYYY-MM-DD date');

  const allowed = dashboardEventTypesForRole(user.role);
  if (allowed !== null && allowed.length === 0) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      403,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }

  const clock = await findStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
  const { from, to } = businessDayWindow(date, clock);
  const entry = entryDateWindow(entryDate, clock);
  // Office Records the role may see are placed by Entry Date; everything else
  // by the Business Day window. A role that sees no Office Record type (Staff)
  // binds no office type at all.
  const office = OFFICE_ACTIVITY_EVENTS.filter((t) => allowed === null || allowed.includes(t));
  const payloadEntryDate = sql`${schema.events.payload} ->> 'entryDate'`;
  const businessWindow = and(
    gte(schema.events.occurredAt, from),
    lt(schema.events.occurredAt, to),
  )!;
  const placedByDate =
    office.length === 0
      ? businessWindow
      : or(
          and(notInArray(schema.events.eventType, office), businessWindow),
          and(
            inArray(schema.events.eventType, office),
            or(
              eq(payloadEntryDate, entryDate),
              and(
                isNull(payloadEntryDate),
                gte(schema.events.occurredAt, entry.from),
                lt(schema.events.occurredAt, entry.to),
              ),
            ),
          ),
        )!;

  const primaryRole = sql`${schema.events.metadata} -> 'grouping' ->> 'role'`;
  const conds: SQL[] = [
    eq(schema.events.organizationId, user.organizationId),
    eq(schema.events.stationId, stationId),
    placedByDate,
    or(
      isNull(schema.events.correlationId),
      and(isNotNull(schema.events.correlationId), eq(primaryRole, 'primary')),
    )!,
  ];
  if (allowed !== null) conds.push(inArray(schema.events.eventType, [...allowed]));

  const joins = activityJoins(user.organizationId);
  // Count only siblings this role may see, so Staff never learn of hidden
  // Office Record siblings. Same single correlated subquery: no extra statement.
  const memberTypeFilter =
    allowed === null
      ? sql``
      : sql`AND activity_group_members.event_type IN (${sql.join(
          allowed.map((t) => sql`${t}`),
          sql`, `,
        )})`;
  const relatedCount = sql<number>`CASE
    WHEN ${schema.events.correlationId} IS NULL THEN 0
    ELSE (
      SELECT count(*) - 1
      FROM events AS activity_group_members
      WHERE activity_group_members.organization_id = ${user.organizationId}
        AND activity_group_members.station_id = ${stationId}
        AND activity_group_members.correlation_id = ${schema.events.correlationId}
        ${memberTypeFilter}
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
    .orderBy(asc(schema.events.occurredAt), asc(schema.events.eventId));

  const items: ActivityGroupSummary[] = rows.map((row) => {
    const isLegacy = row.correlationId === null;
    return {
      groupId: row.correlationId ?? row.eventId,
      primary: formatActivityEvent(row, isLegacy),
      relatedCount: row.relatedCount,
      primaryRecordedAt: row.recordedAt,
      isLegacy,
    };
  });
  return c.json({ success: true, data: { date, items, nextCursor: null } });
};

/**
 * The one `GET /activity` handler. Dispatch is explicit on `date`: dated
 * requests are the role-filtered Business Day feed; undated ones are the
 * Owner-only audit log (`auditFeed`) behind an explicit owner check. Nothing
 * depends on `next()` fall-through or route registration order.
 */
export function activityHandler(auditFeed: (c: Context<Env>) => Response | Promise<Response>) {
  return (c: Context<Env>) => {
    if (c.req.query('date') !== undefined) return activityDayHandler(c);
    if (!isOwner(c.var.user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners can view the activity log' },
        },
        403,
      );
    }
    return auditFeed(c);
  };
}
