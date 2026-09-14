# Event activity documentation and hardening

Type: task
Status: planned
Blocked by: 02, 03, 04, 05, 06

## Objective

Record the accepted model, add contributor checks, and run broad validation.

## Scope

- Update `CONTEXT.md` with approved business terms only.
- Add an ADR for grouping metadata, typed presentation metadata, actor kinds, logical-command correlation, and strict causation semantics.
- Document how to add a new business event and its activity template.
- Add a checklist for actor, correlation, activity values, primary role, and causation.
- Add diagnostics for fallback rendering, unknown templates, and malformed groups.
- Review event metadata for sensitive data.
- Verify query plans and index use with representative data.
- Run all focused and workspace validation.

## Proposed glossary terms

- `Activity Group`: all Business Events produced by one accepted logical command.
- `Primary Event`: the Business Event used as the group's human-readable summary.
- `Related Event`: another Business Event in the same Activity Group, shown under the primary event.

Only add these to `CONTEXT.md` after review confirms they are domain language rather than UI-only terms.

## Contributor checklist

A new event emitter must answer:

1. What immutable fact does the event record?
2. Which event type and payload version does it use?
3. What is the logical command correlation ID?
4. Is it primary or related?
6. Was it actually triggered by another event, or is it only a same-command sibling?
7. Which action-time display snapshots does its template require?
7. Does it preserve `actorId` and actor snapshot?
8. Does it avoid sensitive or unrestricted free text?
9. Which tests prove its description and relationships?

## Validation

- Core focused tests and build.
- API focused tests and build.
- UI focused tests and build.
- Full workspace tests.
- Full workspace build.
- Project diagnostics.
- Manual Owner activity-feed smoke test with sale, credit sale, purchase, expense, stock variance, and shift close.

## Acceptance criteria

- Accepted terminology and decisions are recorded.
- Contributor documentation prevents untemplated new event types.
- No sensitive values appear in activity metadata samples.
- Query plans meet the recorded primary-row and group-detail budgets.
- All validation passes or unrelated failures are documented.

## Comments

