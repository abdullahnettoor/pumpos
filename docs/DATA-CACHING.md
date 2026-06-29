# Data Caching Practice

How PumpOS caches client data to stay fast **without same-session stale data**. Built on
TanStack Query. For the agent-facing version + review checklist, see
[`.agents/skills/pump-data-caching/SKILL.md`](../.agents/skills/pump-data-caching/SKILL.md).
For the full performance plan and the static/semi audit, see
[roadmap/phase-P-performance.md](roadmap/phase-P-performance.md).

## Tier data by volatility
Every fetched entity belongs to one tier (`TIER` in `packages/ui/src/query/hooks.ts`):

| Tier | Entities | staleTime | gcTime | refetchOnFocus | Persisted |
|---|---|---|---|---|---|
| static | stations, tanks, dispensers, nozzles, terminals, shift templates, users | 24h | 24h | off | yes |
| semi | products, customers, suppliers, expense categories | 10m | 1h | off | yes |
| operational | shift status, sales, collections, inventory, DSSR | 15s | 5m | on | no |

## The five rules
1. **Read through hooks**, not imperative `service.getX()` calls. For event handlers / routing
   use `qc.ensureQueryData` / `qc.fetchQuery` with the same centralized key.
2. **Centralize keys** in `queryKeys`; reuse the exact key for reads and invalidation.
3. **Every mutation invalidates its key(s).** Setup edits invalidate their static/semi key
   (a `force` reload param). Operational writes use `useInvalidateOperational`, which also
   refreshes `customers` and `suppliers` (computed balances move operationally).
4. **Persist only static/semi** via `PERSIST_PREFIXES`; bump `CACHE_BUSTER` on shape changes.
5. **No `refetchOnMount: 'always'`** on tiered queries.

## Why
Static infra/setup data rarely changes, so caching it (24h + localStorage) removes most repeat
API calls and paints the shell instantly. Operational data stays near-live (15s + focus refetch).
Same-session correctness is guaranteed because every write busts its key on the shared client, so
the change shows everywhere immediately. Cross-device changes reflect after the tier's staleTime —
the intended volatility tradeoff.

## Measuring
The API sets a `Server-Timing: app;dur=<ms>` header (`apps/api/src/index.ts`) and logs `[SLOW]`
for >1s requests. Use the browser Network tab to confirm fewer calls on repeat navigation.

## Key files
- `packages/ui/src/query/hooks.ts` — `TIER`, `queryKeys`, hooks, `useInvalidateOperational`.
- `packages/ui/src/query/queryClient.tsx` — persistence, `PERSIST_PREFIXES`, `CACHE_BUSTER`.
