# Activity accordion UI

Type: task
Status: planned
Blocked by: 04

## Objective

Present one compact row per activity group and reveal related events in an accessible accordion.

## Scope

- Add typed group-summary and group-detail models to the UI service layer.
- Update the activity summary query hook.
- Add centralized summary-page and group-detail query keys and operational-tier hooks.
- Include station, type, limit, cursor, and group ID in keys where applicable.
- Add Load more or `useInfiniteQuery` so older groups remain reachable.
- Replace UI-side event descriptions with API-rendered title and description.
- Build the collapsed group row and lazy accordion content.
- Preserve station filtering and add type filtering only if the existing screen design supports it cleanly.
- Remove obsolete `EVENT_LABELS` and `eventDetail()` after legacy fallback moves to the API.

## Interaction

- Accordion is closed by default.
- Show the trigger only when `relatedCount > 0`.
- Fetch detail on first expansion.
- Cache fetched detail and keep it when collapsed.
- Show compact loading and inline error states.
- Render a one-level list of same-command related events.
- Preserve true causation as technical detail without inventing visual nesting for sibling facts.
- Show a related event's actor only when it differs from the primary actor.
- Keep raw event type visible but subdued.

## Accessibility

- Use a button for the accordion trigger.
- Set `aria-expanded` and `aria-controls`.
- Support keyboard activation and visible focus.
- Keep DOM order equal to visual order.
- Respect reduced motion.
- Do not rely on color alone for state.

## Caching

- Use the operational TanStack Query tier.
- Do not persist activity data.
- Invalidate activity summaries and open group details after relevant mutations if broad operational invalidation does not cover them.
- Follow `.agents/skills/pump-data-caching/SKILL.md` during implementation.

## Tests

- One top-level row for a multi-event group.
- Correct related count.
- One detail fetch on first expansion.
- Related-event actor suppression and override behavior.
- Tenant, platform-admin, explicit system, and unknown actor labels.
- Pagination reaches a second page without duplicate groups.
- Loading, detail error, empty, and legacy states.
- Keyboard and ARIA state.

## Acceptance criteria

- Related events no longer flood the top-level feed.
- Every related event remains available through the accordion.
- Actor, station, and timestamp are clear on the main row.
- UI build and focused tests pass.

## Comments

