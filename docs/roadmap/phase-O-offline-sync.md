# Phase O — Resilience & Sync (Desktop)

**Target: Level 2 — online-primary, graceful degradation.** The app is used mostly
online; a connectivity drop must never block the operator, and queued work
reconciles when the network returns. This is **not** cold-start offline-first and
**not** multi-day disconnected operation (that is Level 3, explicitly future —
see Expansion). Mobile stays online-only. PostgreSQL is authoritative; the local
store is a durable write outbox + warm read cache, never the source of truth.

## The three levels (for shared vocabulary)
- **Level 1 — none:** every action needs the network (not our bar).
- **Level 2 — graceful degradation (THIS PHASE):** online-primary; tolerate
  transient drops; optimistic writes + durable outbox + retry; warm-cache reads;
  reconcile on reconnect. No full local DB mirror, no seeding.
- **Level 3 — standalone (future, only if discovery demands):** run disconnected
  for hours/days via a full SQLite read-model mirror, login seeding, sync cursor,
  encrypted cache, multi-device-per-station.

## Tauri leverage
Desktop bundles the built assets locally (`frontendDist`), so the UI, code, and
fonts already cold-start offline — only data/API calls need the network. This is
the desktop reliability differentiator over the pure web app.

## Foundations present
- Event-driven core; transactional outbox (`events`); `idempotency_keys`; UUID ids; `SyncIndicator` component.

## O1 — Durable write outbox (highest ROI, do first)
- Persist queued mutations so a refresh/crash never loses them: Tauri SQLite (sql
  plugin) on desktop, IndexedDB on web, behind one `SyncQueue` port (ports & adapters).
- Optimistic apply; capture mutations as events; idempotent replay via `idempotency_keys`.

## O2 — Retry + reconnect
- Push queued events when online; retry/backoff; real network detection (heartbeat
  to the API, not just `navigator.onLine`). Pull cloud changes since a cursor.

## O3 — Conflict policy (light)
- Append-only events minimize conflicts; last-writer-wins on projections; flag only
  money-sensitive collisions (drawer / shift-close) for review.

## O4 — UX (never block)
- Online/offline + pending count (extend `SyncIndicator`). Core actions — including
  **business-day / shift close** — must **queue and reconcile**, never be blocked on
  the network. Show honest sync state (online / pending N / failed) + retry/backoff.

## Expansion — Level 3 (future, gated behind real demand)
- Full SQLite read-model mirror; seed on login; partial sync; encrypted cache;
  background sync service; multi-device per station; audit of replays.

