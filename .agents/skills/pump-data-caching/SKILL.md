---
name: pump-data-caching
description: Apply PumpOS's tiered client-side data caching practice when adding, reviewing, or refactoring any data fetch in the React/TanStack Query frontend. Use whenever creating a query hook, fetching reference/operational data, wiring a mutation, or diagnosing redundant API calls or stale-data bugs. Ensures performant caching by volatility tier without same-session staleness.
---

# PumpOS Data Caching Practice

Make the app performant by caching data **by how often it changes**, while guaranteeing
**no same-session stale data** through disciplined invalidation. Built on TanStack Query.

## Core idea: three volatility tiers
Classify every fetched entity into one tier and apply its policy (defined as `TIER` in
`packages/ui/src/query/hooks.ts`):

| Tier | Examples | staleTime | gcTime | refetchOnFocus | Persist (localStorage) |
|---|---|---|---|---|---|
| **static** | stations, tanks, dispensers, nozzles, POS terminals, shift templates, users | 24h | 24h | off | yes |
| **semi** | products, customers, suppliers, expense categories | 10m | 1h | off | yes |
| **operational** | shift status, sales, collections, inventory, DSSR | 15s | 5m | on | no |

Auth/session and anything live are operational (or uncached); never persist them.

## Required rules

1. **Fetch through query hooks, not imperatively.** Every read goes through a `useXxx` hook
   (or `qc.ensureQueryData` / `qc.fetchQuery` when you need data inside an event handler or
   for routing). Never call `service.getX()` directly in a component body — that bypasses the
   cache and re-hits the API every render/mount.
2. **One key per entity, centralized.** Add the key to `queryKeys` in `hooks.ts`. Reuse the
   exact same key everywhere (including `ensureQueryData`) so reads and invalidations align.
   Invalidation by key prefix (`['suppliers']`) clears all variants (`['suppliers', true/false]`).
3. **Every mutation invalidates its key(s).** This is the anti-stale rule:
   - Setup-screen create/update/delete → invalidate that static/semi key (e.g. a `force`
     param on `loadData` that runs `qc.invalidateQueries({ queryKey })` before refetch).
   - Operational mutations (shift/sale/collection/expense/purchase/supplier payment) →
     `useInvalidateOperational`, which clears operational keys **plus** the semi entities whose
     computed balances move (`customers`, `suppliers`).
4. **Persist only static + semi.** In `queryClient.tsx`, `PERSIST_PREFIXES` lists the safe
   key prefixes; bump `CACHE_BUSTER` when a payload shape changes so old persisted data is dropped.
5. **Cross-screen safety.** Because invalidation is global on the shared client, busting a key in
   one screen refreshes it everywhere. If you add a new place that *mutates* a cached entity,
   you MUST invalidate that key there (or via `useInvalidateOperational`).

## Review checklist (before merge)
- [ ] New reads use a hook / `ensureQueryData` with a centralized key + correct tier.
- [ ] Every create/update/delete for a cached entity invalidates its key (check ALL screens that
      mutate it, not just the one you edited).
- [ ] Entities with computed balances that change operationally (customers, suppliers) are in
      `useInvalidateOperational`.
- [ ] Nothing operational/auth is added to `PERSIST_PREFIXES`.
- [ ] No `refetchOnMount: 'always'` on tiered queries (it defeats the cache).
- [ ] Measure with the API `Server-Timing` header; confirm fewer network calls on repeat nav.

## Common stale-data traps
- A mutation in screen B that doesn't invalidate a key read by screen A → stale until staleTime.
  (Real example fixed: supplier create in PurchasesList not invalidating `suppliers`.)
- Local optimistic delete (`setState`) without invalidating → item reappears on remount from cache.
- Imperative `service.getX()` left in a component → cache never applies; API called every time.
- Stale closures capturing state in long-lived subscriptions (use refs) — see App session resolve.

## Key files
- `packages/ui/src/query/hooks.ts` — `TIER`, `queryKeys`, hooks, `useInvalidateOperational`.
- `packages/ui/src/query/queryClient.tsx` — `createQueryClient`, persistence, `PERSIST_PREFIXES`, buster.
- `docs/roadmap/phase-P-performance.md` — full performance plan + the static/semi audit table.
