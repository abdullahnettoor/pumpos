# Grouped activity API

Type: task
Status: planned
Blocked by: 01, 02

## Objective

Replace the raw row feed with tenant-scoped activity-group summaries and lazy related-event details.

## Scope

- Add typed activity page, group-summary, group-detail, event, and actor response models.
- Update `GET /api/activity` to return primary group summaries.
- Add `GET /api/activity/:groupId` for same-command related events.
- Render event descriptions through the core activity module.
- Prefer actor snapshots and retain tenant-user and legacy platform-actor fallbacks.
- Add seek pagination and current station/type filters.
- Handle legacy events with null correlation IDs.
- Stop returning raw payloads from group summaries.
- Prototype the exact SQL and query plans before choosing indexes.
- Add justified event-feed indexes in Drizzle schema and a migration.

## Response contract

Return the standard success envelope with:

```ts
interface ActivityPage {
  items: ActivityGroupSummary[];
  nextCursor: string | null;
}
```

The opaque cursor contains the primary event's `recordedAt` and `eventId`. Reject malformed cursors with `VALIDATION_ERROR`.

## Query behavior

- Group key is `correlationId`, or `eventId` for a legacy event.
- Summary rows come from explicit primary events and legacy null-correlation events.
- Sort by primary `recordedAt`, then primary `eventId`, both descending.
- Limit counts groups, not raw event rows.
- A station or type filter matches a group when any member matches.
- Group detail returns the full matching group for context.
- Every query includes `organizationId` scope.
- Related events load only from the detail endpoint.

## Relationship behavior

- Select the event marked primary as the group summary.
- Treat legacy null-correlation events as synthetic one-event groups.
- Diagnose related-only malformed correlated groups instead of inventing a primary.
- Return same-command sibling events in stable chronological order.
- Preserve true `causationId` in each item but do not build a false tree from co-emitted events.
- Keep unparented related events visible.

## Query-plan gate

Do not aggregate all organization events and sort by `MAX(recorded_at)`. Prototype a primary-row seek query and run `EXPLAIN (ANALYZE, BUFFERS)` with representative data before merging.

Initial index candidates:

- partial primary-row index on `(organization_id, recorded_at DESC, event_id DESC)`
- group-detail index on `(organization_id, correlation_id, recorded_at, event_id)`
- unique partial index on `(organization_id, correlation_id)` for non-null correlations marked primary

Station and type filters may use `EXISTS` against group members. Add filter-specific indexes only when measured plans require them. Record representative row counts, execution time, scanned rows, and buffers in the ticket comments.

## Pagination tests

- Tied timestamps use `eventId` as the stable second key.
- A second page does not repeat first-page groups.
- New groups inserted after page one do not duplicate older cursor pages.
- Malformed cursors return a validation error.
- The response always includes `nextCursor`.

## Other tests

- Owner authorization and forbidden roles.
- Tenant isolation in summary and detail.
- Station/type filters through related events.
- Legacy synthetic groups.
- Primary selection and related sibling ordering.
- Duplicate-primary rejection and related-only-group diagnostics.
- Tenant actor snapshot preference.
- Legacy platform actor does not render as System.
- Explicit system actor does render as System.
- No raw payload in summary response.

## Acceptance criteria

- A multi-event purchase produces one summary row with the correct related count.
- Expanding its group returns every related sibling event.
- Legacy rows remain visible.
- Cross-tenant group IDs return no data.
- Duplicate primaries are prevented by the partial unique index.
- Related-only malformed groups are reported through diagnostics or an audit inspection path.
- Query plans meet the measured gate agreed during implementation.
- API tests and build pass.

## Comments

