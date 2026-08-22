# Complete mutation and event-description coverage

Type: task
Status: planned
Blocked by: 01, 03

## Objective

Enrich setup and lower-frequency emitters, then audit every live mutation so meaningful actions do not bypass business events.

## Scope

Cover emitted setup and maintenance events for:

- organizations and stations
- users and invitations
- products and prices
- payment terminals
- tanks
- dispensers
- nozzles
- shift templates
- customers
- suppliers
- vehicles
- financial accounts

Audit all mutating routes, including direct Drizzle writes outside core use cases. Known examples to inspect include:

- attendant handovers
- organization updates
- expense and income category writes
- station compliance updates
- platform owner actions

The implementation ticket must search the full API rather than treating this list as complete.

## Classification

Every mutation receives one status:

- emits an enriched business event transactionally
- emits a generic business event transactionally, with a follow-up enrichment ticket
- intentionally emits no event because it is not a meaningful business action, with a written reason
- defect: meaningful mutation currently bypasses events
- catalogued for future functionality with no live mutation

A live meaningful mutation cannot be classified as merely future because its catalog type has no current core emitter.

## Rules

- Update events capture the resulting display name and only concise change summaries.
- Delete or archive events capture the pre-change display name.
- User-management events distinguish the actor from the affected user.
- Platform actions preserve the platform-admin actor kind even when tenant `actorId` is null.
- Invitation templates avoid exposing more personal information than the Owner-only screen already permits.
- Product and infrastructure events use station-specific names and codes where useful.
- Never rename or remove existing event types.
- Add a new append-only event type when a meaningful live action has no truthful catalog entry. Add its presentation definition and tests in the same change.
- No new role names are introduced in tenant authorization.
- Direct business mutations move behind a core use case and transactional event append when practical.
- No event creation may be added after commit as a best-effort side effect.

## Catalog audit

Compare all `BusinessEvents` values, all `eventFromContext()` emitters, and all mutating routes. Produce a test-backed coverage list with these states:

- live and enriched
- live with intentional generic fallback
- live mutation missing an event
- catalogued but genuinely not live

No event or live mutation may be silently absent.

## Tests

- Coverage test fails when a new event type lacks presentation data.
- Mutation audit fixture or documented script catches a new unclassified mutating route.
- Update/delete snapshots preserve action-time target names.
- Platform events retain platform identity.
- The Stage 3 handover repair and any other repaired mutation commit data and events atomically.
- Organization, category, compliance, and other audited mutations either use a truthful existing event, add a new event type, or have an approved non-business classification.

## Acceptance criteria

- Every current emitter supplies valid presentation metadata or has a documented generic fallback.
- Every meaningful live mutation emits a business event transactionally.
- Every update/delete description names its target using an action-time snapshot.
- Future-only catalog entries are proven to have no live mutation.
- The catalog, emitter, and mutation audit passes in CI.
- Core and API tests and builds pass.

## Comments

