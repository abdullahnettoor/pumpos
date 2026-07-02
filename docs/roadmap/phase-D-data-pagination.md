# Phase D — Data Access & Pagination

**Goal:** stop fetching unbounded lists all at once. Add server-side **keyset pagination**
(+ sensible default windows and search) to the high-growth list endpoints so the app stays fast
as operational data accumulates. Work each API independently and validate before moving on.

> Related: Phase P (client caching) is complementary — pagination reduces payload size; caching
> reduces refetches. This phase also unblocks removing the client-side "sum the whole list"
> pattern used by the dashboard today-totals (prefer real summary endpoints — see F1/F3).

---

## Diagnosis (confirmed 2026-07-02)
Most list endpoints in [`apps/api/src/routes/transactions.ts`](../../apps/api/src/routes/transactions.ts)
`.orderBy(...)` with **no `.limit()`** — they return **every row for the org/station**, and the
frontend filters client-side via the TanStack cache. This is fine at MVP volume but these tables
grow **unbounded** (`expenses`, `purchases`, `collections`, `stock_movements`, `events`).

Exceptions that already cap results (but are **not** full pagination — no cursor to go deeper):
- `GET /activity` — `limit` (default 50, max 200), newest-first.
- `GET /transactions/vehicles/search` — `limit` 20–50, requires a query.
- DSSR range — bounded by `from`/`to` dates.
- `.limit(1)` calls — single-record lookups, not lists.

**No keyset / offset / cursor pagination exists anywhere yet.**

---

## Approach (standard for this phase)

### Pagination style: keyset (seek), not OFFSET
OFFSET degrades at depth. Use a stable cursor over the sort key:
- Sort operational lists by `(recorded_at DESC, id DESC)` (or `created_at`).
- Request: `?limit=<n>&before=<cursor>` where `cursor` encodes the last row's `(sortValue, id)`
  (base64 of `"<iso>|<uuid>"` is enough).
- Response envelope:
  ```jsonc
  { "success": true, "data": [ ... ], "nextCursor": "<opaque|null>" }
  ```
  `nextCursor` is null when no more rows. `limit` defaults to 50, hard-capped (e.g. 200).

### Default window for operational lists
Most operators only look at recent data. Default each operational list to the **current business
month** (or last N days) with an explicit "load older" affordance, rather than page-1-of-everything.

### Reference data (customers/suppliers/products)
Usually bounded — leave as fetch-all until a station has hundreds, then add **server-side search**
(`?q=`) instead of paging. (The `Combobox` primitive already does client-side type-ahead.)

### Client
Use TanStack Query **`useInfiniteQuery`** with `getNextPageParam: (last) => last.nextCursor`.
Render "Load more" (or infinite scroll). Keep the tiered cache policy from Phase P.

---

## Per-API worklist
Tackle top-down (fastest-growing / most-viewed first). Tick when server + client + validation done.

| # | Endpoint | File | Current | Plan | Priority | Status |
|---|---|---|---|---|---|---|
| D1 | `GET /activity` | `apps/api/src/index.ts` | limit cap only | keyset `before` + `nextCursor`; infinite scroll in ActivityFeed | High (fresh, self-contained → reference impl) | ☐ |
| D2 | `GET /transactions/collections` | `transactions.ts` | fetch-all | keyset + default month window | High | ☐ |
| D3 | `GET /transactions/expenses` | `transactions.ts` | fetch-all | keyset + default month window | High | ☐ |
| D4 | `GET /transactions/purchases` | `transactions.ts` | fetch-all | keyset + default month window | High | ☐ |
| D5 | `GET /transactions/inventory/movements` | `transactions.ts` | fetch-all | keyset + default window | Medium | ☐ |
| D6 | `GET /transactions/inventory/variances` | `transactions.ts` | fetch-all | keyset | Medium | ☐ |
| D7 | `GET /shifts/shift-summaries` | `shifts.ts` | fetch-all | keyset (or date window) | Medium | ☐ |
| D8 | `GET /transactions/customers` | `transactions.ts` | fetch-all | leave; add `?q=` search when large | Low | ☐ |
| D9 | `GET /transactions/suppliers` | `transactions.ts` | fetch-all | leave; add `?q=` search when large | Low | ☐ |
| D10 | customer/supplier ledger lists | `transactions.ts` | fetch-all | keyset if a single account grows large | Low | ☐ |

---

## Implementation recipe (per endpoint)

**Server**
1. Read `limit` (clamp) + `before` cursor query params.
2. Decode cursor → add `WHERE (recorded_at, id) < (:ts, :id)` (keyset predicate).
3. Optional default window: if no cursor and no explicit range, constrain to current business month.
4. `ORDER BY recorded_at DESC, id DESC LIMIT :limit+1`; if `limit+1` rows returned, drop the extra
   and emit its cursor as `nextCursor`.
5. Return `{ success, data, nextCursor }` (keep existing envelope + add `nextCursor`).

**Client**
1. Service method accepts `{ before?, limit? }`, returns `{ data, nextCursor }`.
2. Convert the hook to `useInfiniteQuery` (query key includes filters, NOT the cursor).
3. Flatten pages for rendering; add "Load more" wired to `fetchNextPage` / `hasNextPage`.
4. Keep the Phase P tier (operational, not persisted).

**Validation (per API)**
- [ ] First page returns ≤ `limit` rows, newest-first.
- [ ] `nextCursor` paginates with **no gaps/dupes** across the boundary (insert a row mid-scroll → no shift).
- [ ] `limit` is clamped (try `?limit=100000`).
- [ ] Org/station scoping still enforced; role guard unchanged.
- [ ] Response time flat as you page deeper (Server-Timing header).
- [ ] Client "Load more" appends; cache invalidation on new writes still refreshes page 1.

---

## Out of scope (tracked elsewhere)
- **Server aggregates** for dashboards/reports (today totals, period sums) → Phase F (F1 COGS,
  F3 rollups). Pagination alone doesn't remove the need to stop client-summing for metrics.
- Client caching / route code-split → Phase P.
