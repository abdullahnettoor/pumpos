Type: task
Status: open
Blocked by: none

## Task

Prevent persisted DSSR generation for open Business Days and define an auditable explicit regeneration policy. Ensure normal Business Day close always produces or returns the authoritative immutable final snapshot without preserving a stale pre-close snapshot.

## Acceptance Criteria

- Open Business Days can be previewed but cannot create a persisted DSSR Snapshot.
- Closing a Business Day creates the final DSSR from all committed source records.
- Normal close never silently replaces an existing immutable snapshot.
- Explicit regeneration is auditable and follows a documented revision/replacement policy.
- Core tests cover open-day rejection, final generation, idempotency, and regeneration behavior.
