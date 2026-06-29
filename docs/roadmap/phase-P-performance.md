# Phase P — Performance & Caching

**Goal:** make the app feel instant. Tier client caching by data volatility, lazy-load page
sections, parallelize slow API routes, and measure everything. Low-risk, incremental.

## Diagnosis (confirmed)
- Bottleneck is **backend/DB**, not UI rendering. `/shifts/status` runs ~10 **sequential** DB
  round-trips (`apps/api/src/routes/shifts.ts`): template → 2× user lookup → nozzle rows →
  handovers → terminal entries → Promise.all(expenses/purchases/collections) → station → business
  day. Over Hyperdrive each trip ~1.5s → ~18s total. `/inventory/status` ~5s, `/transactions` ~4s.
- Dev-only tax: remote Hyperdrive + failing JWKS fetch per request (TLS warnings) add seconds.
- UI compounds it by gating the whole page on these calls (no partial render).
- **Not** a Hyperdrive-vs-Supavisor or host (Vercel) problem — it's query pattern + no caching.

## Already done
- `Server-Timing: app;dur=<ms>` header on every response + `[SLOW]` log >1s (`apps/api/src/index.ts`).
  Inspect in browser Network → Timing. Use for before/after numbers.

---

## P1 — Tiered client caching (TanStack Query)
Classify every query key by volatility and assign cache policy.

| Tier | Entities | Endpoints (approx) | staleTime | gcTime | Persist |
|---|---|---|---|---|---|
| **Static** | stations, tanks, DUs, nozzles, POS terminals, shift templates | `/setup/*` | `Infinity` (until edited) | 24h | yes |
| **Semi-static** | users, suppliers, customers, vehicles, products | `/transactions/customers`, `/suppliers`, `/setup/products`, users | 10 min | 1h | optional |
| **Operational** | shift status, sales, credit, collections, inventory status, session | `/shifts/status`, `/transactions/*`, `/inventory/status` | 0–30s | 5m | no |

Tasks:
- Create a **query-key registry** (`packages/ui/src/services/queryKeys.ts`) — central keys + a
  `TIER` map so policy is declarative, not scattered.
- Set per-key `staleTime`/`gcTime` in the query hooks (or a wrapper `useTieredQuery`).
- Default `refetchOnWindowFocus: false` for static/semi-static; keep for operational if desired.

## P2 — Persistence for static/semi-static
- Add `@tanstack/query-persist-client` + `createSyncStoragePersister` (localStorage) in
  `createQueryClient` (`packages/ui/src/contexts/`), with a `dehydrateOptions` filter that persists
  ONLY static + semi-static tiers (never operational/auth).
- Bump a `buster` (app version) to invalidate stale persisted cache on deploy.
- Effect: instant paint of shell + dropdowns from cache; infra fetched only when missing/edited.
- Synergy: groundwork for Phase O (offline desktop).

## P3 — Invalidation map
- On each mutation, invalidate ONLY related keys (not blanket). Examples:
  - Open/close shift, record sale/credit/collection/expense → invalidate `shift-status`,
    `inventory`, relevant `transactions` (operational only).
  - Setup edits (tanks/DUs/nozzles/terminals/templates) → invalidate that static key.
  - Customer/supplier/product create-update → invalidate that semi-static key + dependent operational.
- Extend the existing `invalidateOperational` helper into a small `invalidateFor(action)` map.
- Prefetch static tier on login (`prefetchQuery`) so first paint is warm.

## P4 — Parallelize slow API routes (server)
- `/shifts/status`: collapse 2 user lookups into JOINs; wrap independent selects in `Promise.all`.
  Target ~18s → ~2–3s. Then apply to `/inventory/status`, `/transactions`.
- Verify before/after via Server-Timing.

## P5 — Lazy per-section UI
- Split heavy pages (Shifts) into independent hooks per card (overview / nozzles / handovers /
  transactions / inventory) each with skeleton + error boundary. Page renders immediately; slow
  cards fill in. Never block the app on one card.

## P6 — DB hygiene
- Confirm indexes on hot filters (`shift_id`, `station_id`, `business_day_id`) — partially in
  migration 0002. Add any missing. Reuse one Hyperdrive connection per request (already via middleware).

---

## Measurement protocol
1. Record current Server-Timing for `/shifts/status`, `/inventory/status`, `/transactions` on **prod**.
2. Apply P4, re-measure (server trips).
3. Apply P1–P3, count network requests per navigation (cache hits) in DevTools.
4. Apply P5, measure time-to-first-meaningful-paint.

## Rollout order (lowest risk → highest impact)
P1 → P2 → P3 (caching, immediate perceived win) → P4 (server, biggest absolute win) → P5 (UX) → P6.

## Risks / notes
- Persisted cache staleness → mitigate with `buster` + invalidation map; never persist auth/operational.
- Over-invalidation defeats caching → keep the map precise.
- Static tier `Infinity` requires disciplined invalidation on setup edits (covered by P3).
- Measure prod, not dev (dev has remote-Hyperdrive + JWKS penalties).

## Expansion
- Cloudflare Hyperdrive query caching for read-heavy static endpoints; ETag/Cache-Control on
  `/setup/*`; optimistic updates for operational writes; background refetch; IndexedDB persister for
  larger caches; SWR-style prefetch on hover/route intent.
