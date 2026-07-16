# Phase O — Offline & Sync (Desktop)

**Goal:** desktop keeps operating offline; reconciles to cloud when back. Mobile stays online-only. PostgreSQL authoritative, SQLite operational cache.

## Foundations present
- Event-driven core; transactional outbox (`events`); `idempotency_keys`; UUID ids; `SyncIndicator` component.

## O1 — Local SQLite cache
- Tauri SQLite (sql plugin); mirror read models needed for shift ops; seed on login.

## O2 — Event queue + replay
- Local outbox; capture mutations as events; push when online; idempotent replay via `idempotency_keys`. Pull cloud changes since cursor.

## O3 — Conflict policy
- Append-only events reduce conflicts; last-writer-wins on projections; flag drawer/shift-close conflicts for review.

## O4 — UX
- Online/offline + pending count (extend SyncIndicator); block business-day/shift close until synced; retry/backoff.

## Expansion
- Multi-device per station, partial sync, encrypted cache, background sync service, audit of replays.
