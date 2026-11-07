# PumpOS coding standards (for reviewers)

These are the **judgement** rules a reviewer applies to a diff: rules no linter
can check. The domain itself lives in [`AGENTS.md`](AGENTS.md),
[`GLOSSARY.md`](GLOSSARY.md) and [`docs/adr/`](docs/adr/); this file says how
to hold a diff against them, and names the canonical helper for each rule. Cite
a rule by its heading when you raise a finding.

## How to review: fix the class, not the instance

Every finding is an **invariant** plus the **search** that finds every place
it must hold. Write it that way:

> Invariant: every query on `purchases` filters `organization_id`.
> Search: `graft grep "from(purchases"` / `rg "purchases\b" apps/api/src`.
> Instances: `purchasing-repositories.ts:120`, `:188`, `reports.ts:344`.

- Run the search yourself and list **every** instance in the diff and its
  siblings outside it, so the fix lands once. A finding fixed in three of four
  places costs another review round; the usual repeat offenders are tenant
  filters, cost redaction on a new route, and hand-copied result senders.
- On a re-review, re-run each earlier finding's search before reading new
  code. A previously fixed invariant broken by a new file is a Blocker.
- Exhaustive questions need exhaustive tools: `graft grep` or `rg`, never a
  ranked `graft ask`.

## Severity

- **Blocker**: tenant leak, missing server-side check, money or stock figure
  wrong or recomputed outside core/shared, closed-day snapshot mutated or
  recomputed, event missing for a business action, non-idempotent write,
  check-then-write race, failure rendered as empty, spec item silently
  missing, test that cannot fail guarding the change.
- **Should fix**: local copy of a shared helper, logic in a route or
  component that belongs in core/shared, missing test for a changed route or
  use-case, stale comment/doc/ADR status, unvalidated param, off-glossary
  copy, unrelated file in the diff.
- **Nit**: naming, ordering, a clearer test name. Never block on a Nit.

## Spec fidelity

- Map every item of the originating issue/spec to the diff. Each is
  **delivered** or **deferred** with a linked follow-up issue (tracker:
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)). An item
  that is neither is a Blocker.
- Tests the spec asks for are present, by name.
- Unrequested scope (a new setting, a refactor of a neighbouring screen, a new
  endpoint) is a finding: split it out or justify it in the PR.
- PR description claims match the diff: every "adds", "fixes", "covers" is
  visible in the code.

## Layering

The shape is ports & adapters ([`AGENTS.md` › Code Organization](AGENTS.md)).

- **Core owns business rules.** Money, stock, variance, reconciliation and
  report figures are computed in `packages/core` use-cases or pure functions in
  `packages/shared/src/utils` (e.g. `drawer-reconciliation.ts`,
  `shift-close-cash.ts`, `stock-variance.ts`). A React component or Hono route
  that re-derives one of those figures is a finding, even when the number
  matches today.
- **Routes are thin**: validate (`validateJson` / `validateParams`) → access
  guard → `runInTransaction(db, (tx, events) => useCase.execute(...))` →
  `sendResult(c, result)`. Reference: `apps/api/src/routes/finance.ts`.
  Projections and SQL live in `apps/api/src/infra/repositories/*` or
  `apps/api/src/infra/*-sql.ts` behind a core port, never inline in the route.
- **Events**: every meaningful business action publishes through the `events`
  publisher handed to the use-case, inside the same transaction (the outbox in
  `apps/api/src/infra/transaction.ts`). A new write with no event is a
  Blocker; check the catalog in `packages/core/src/kernel/event-catalog.ts`.
- **UI reads through query hooks** with keys from `queryKeys` in
  `packages/ui/src/query/hooks.ts`; tiers, invalidation and persistence follow
  the `pump-data-caching` skill (`.agents/skills/pump-data-caching/SKILL.md`).
  A mutation that leaves a key stale is a Blocker.

## Reuse the shared helper

A local copy drifts: `STATUS_BY_CODE` exists because a router-local copy
shipped `LIMIT_REACHED` as a 400. Search for an existing helper before
accepting a new one, and flag any re-implementation of:

| Concern                            | Canonical helper                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Result → HTTP envelope + status    | `sendResult`, `STATUS_BY_CODE` — `apps/api/src/infra/send-result.ts`                                                                      |
| Transaction + outbox               | `runInTransaction`, `lockStationInventory` — `apps/api/src/infra/transaction.ts`                                                          |
| Body / path validation             | `validateJson`, `validateParams` — `apps/api/src/utils/validator.ts`; `isUuid` — `apps/api/src/infra/is-uuid.ts`                          |
| Station clock                      | `loadStationClock`, `stationExistsInOrg` — `apps/api/src/infra/station-clock.ts`                                                          |
| Station-scoped read                | `requireStationRead` — `apps/api/src/infra/station-read-guard.ts`                                                                         |
| Row / shift belongs to station     | `authorizeRowStation` — `infra/row-station.ts`; `authorizeShiftStation` — `infra/shift-station.ts`                                        |
| Role and station checks            | `packages/shared/src/permissions/guards.ts` (`isAuthorizedForStation`, `canAssignTeamRole`, …), `can`                                     |
| Cost / sensitive-figure redaction  | `packages/shared/src/permissions/sensitive-figures.ts` (`redactPurchaseCosts`, `redactProductCosts`, …)                                   |
| Business / entry date, windows     | `packages/shared/src/utils/business-date.ts` (`resolveBusinessDate`, `resolveEntryDate`, `businessDayWindow`, `monthBounds`)              |
| Rounding, numeric coercion         | `round2`, `num` — `packages/shared/src/utils/money.ts`; paise sums — `packages/ui/src/utils/ledgerWindow.ts`                              |
| Money, quantity, date display      | `packages/ui/src/utils/format.ts` (`formatMoney`, `formatQuantity`, `formatBusinessDate`, …); `packages/shared/src/utils/display-date.ts` |
| Status words, tones, variance chip | `STATUS_MAP`, `StatusChip`, `VarianceChip` — `packages/ui/src/pump-ds/chip`                                                               |
| Forms                              | `useZodForm` — `packages/ui/src/forms/useZodForm.ts` (React Hook Form + Zod)                                                              |
| Idempotency-Key on a save          | `useKeyedSave`, `sendKeyed` — `packages/ui/src/office-records/`                                                                           |
| Any UI primitive                   | the module table in `packages/ui/src/pump-ds/README.md`                                                                                   |

A helper that is close but not quite right gets extended in place, with its
tests; a fork beside it is a finding.

## Tenancy and authorization

- Every query on a tenant table filters `organization_id`, and `station_id`
  where the table carries one, **including each join and subquery**. Check each
  `from`/`join` in the diff separately; one filtered table does not scope its
  neighbours.
- A route taking a `stationId` (param, query or body) authorizes that station
  under the caller's organization (`requireStationRead`,
  `isAuthorizedForStation`, `stationExistsInOrg`). A route taking a row id
  proves the row's station the same way (`authorizeRowStation`,
  `authorizeShiftStation`). Use-cases re-check `organizationId` on loaded
  aggregates, as `GenerateDssr` does.
- New tenant routers mount through `apps/api/src/routes/tenant-routers.ts` so
  `station-tenancy.test.ts` covers them.
- **The server enforces everything the client enforces**: permissions, Limits,
  Product Capabilities, Restricted Access, cost visibility. A hidden button or
  a client-side redaction without the server-side twin is a Blocker. Every
  route returning cost, margin or supplier figures applies the matching
  `redact*` helper; search all routes returning that shape, not only the new
  one. Gating, Limits and write-policy declarations follow the
  `pump-access-gating` skill (`.agents/skills/pump-access-gating/SKILL.md`).

## Validated edges

- Every JSON body passes `validateJson(schema)`; every path param passes
  `validateParams` with `z.string().uuid()` or an `isUuid` check before it
  reaches a query (pattern: `idParam` in `apps/api/src/routes/decantations.ts`).
  An unchecked `:id` turns a typo into a 500.
- Schemas shared by client and server live in `packages/shared/src/schemas`;
  a second hand-written copy of the same shape is a finding.
- Use-cases still `safeParse` their command; edge validation does not replace
  it.

## Dates and time

- Choose the anchor per ADR 0005
  ([`docs/adr/0005-sales-day-vs-office-calendar-date.md`](docs/adr/0005-sales-day-vs-office-calendar-date.md),
  amended by 0007): sales and forecourt stock → `business_day_id` (+ `shift_id`
  for sales); Office Records → entry date via `resolveEntryDate`. Ask "is this
  paying for fuel or products right now?" of every new record.
- Every date derives from the **station** timezone and Day Start
  (`ExecutionContext.timeZone` / `.businessDayStartsAt`, `loadStationClock`).
  Server-local or UTC slicing of an instant is a Blocker.
- Use-cases read time from `ctx.clock`, never `new Date()` directly
  (`packages/core/src/kernel/clock.ts`).

## Snapshots

- Shift Summary and DSR screens and reports for a closed shift/day read the
  stored snapshot. Recomputing a closed day from live tables is a Blocker.
- Snapshots grow additively; readers treat a missing field as "not recorded",
  never zero ([ADR 0010](docs/adr/0010-snapshots-grow-additively.md)). A
  backfill or rewrite of old snapshots is a Blocker.
- The one regeneration path is `GenerateDssr`'s explicit `force`
  (`packages/core/src/capabilities/reporting/dssr/generate-dssr.ts`). A new
  `force`/regenerate path needs the spec to ask for it.

## Concurrency

- Check-then-write runs inside one transaction, with the row or station lock
  taken **before** the check: `.for('update')` on the row, or
  `lockStationInventory` for inventory-affecting shift boundaries and tank
  reconciliations. A uniqueness rule also has a database constraint.
- Locks are taken in the same order as the existing use-cases touching the
  same rows. A new path locking in a different order is a finding.
- Writes are replay-safe: a retried request with the same Idempotency-Key or
  `event_id` produces one effect.

## Tests that can fail

A test earns its place by going **red** when the behaviour breaks.

- It exercises the real code: the use-case with fake ports, the route through
  Hono with `makeFakeDb` (`apps/api/src/routes/test-fakes.ts`), SQL against
  the database in `apps/api/src/infra/repositories/__integration__`. A test
  that asserts what its own fake returns proves nothing.
- Assertions name the expected value: `toEqual`/`toMatchObject` on the figure,
  the exact row, the error `code`. `length > 0`, `toBeTruthy()` on a list, or
  `getAllBy…()[0]` pass on wrong output.
- Console output is silenced only for a named, expected message, scoped to
  that test.
- Time is injected: `FixedClock` in core, `vi.setSystemTime` in UI/API tests.
  A test that depends on today's date or the runner's timezone is a finding.
- Partial fakes go through `partialFake` (`packages/core/src/__tests__/partial-fake.ts`)
  so unused members stay type-checked.
- Every changed route or use-case has a changed or new test covering the
  change, including the refusal path (wrong org, wrong station, forbidden
  role) for anything touching tenancy or access.

## UI states

- Every region that loads data shows loading, refused, error-with-Retry,
  empty and content distinctly; use `DataSection` and rule 6 of
  `packages/ui/src/pump-ds/README.md`. `data ?? []`, `?.length ?? 0` or a
  default that turns a failed query into "No records yet" is a Blocker.
- Mutations show their pending and failure state; a failed save leaves the
  form's values and key intact.
- Forms use `useZodForm` with a Zod schema; validation rules come from the
  shared schema the server also uses.
- Layout, density and components follow [`DESIGN.md`](DESIGN.md) and the
  `pump-erp-design-system` skill.

## Language

User-facing copy (labels, toasts, errors, empty states, PDFs) uses
[`GLOSSARY.md`](GLOSSARY.md) terms: Business Day, Entry Date, Drawer, Office
Record, Product Sale, Decantation. A synonym or a retired term ("manual
sale") is a finding; search the diff's strings against the glossary.

## Comments and docs stay true

- Comments, docstrings and READMEs touched by the change still describe the
  code: file paths exist, issue numbers refer to the right issue, named
  functions still exist.
- A change that departs from an ADR updates that ADR's `Status:` line (e.g.
  "amended by 0007") or adds a new ADR; `AGENTS.md`, `GLOSSARY.md` and
  `docs/USER-FLOW.md` change with the behaviour they describe.

## Scope hygiene

- The diff contains only files the change needs. Local or generated files
  (`opencode.json`, `*.tsbuildinfo`, editor config, scratch files) are a
  finding.
- New imports resolve to a dependency declared in **that** workspace's
  `package.json`, not one hoisted from a sibling.
- `schema.ts` changes ship with their generated migration (Drizzle skill).

## Where the mechanical rules live

Assume these pass in CI; review only what they cannot see.

- `vite.config.ts` › `lint` — Oxlint rules and per-folder import boundaries
  (e.g. `apps/mobile/src/ui` and `lib` layering); `fmt` — formatting.
- `scripts/check-*.mjs` — guard scripts run by `npm run lint`
  (`check-no-hook-disables`, `check-icon-button-labels`,
  `check-domain-patterns`) and by release CI. `check-domain-patterns` ratchets
  UTC date slicing, role-name comparisons, awaited invalidation, inline query
  keys, local formatting and result-sender copies against
  `scripts/domain-patterns-baseline.json`; a diff that grows the baseline or
  adds a `domain-allow` comment needs a stated reason.
- `packages/ui/src/pump-ds/classGuard.test.ts` — dead Tailwind classes,
  undefined CSS vars, raw colours, default-palette classes, text under 12px.
- `npm run db:check -w @pump/db` — migration chain and the
  `supabase/migrations` sync.
- `apps/api/src/infra/write-policy-coverage.test.ts`,
  `apps/api/src/routes/station-tenancy.test.ts` — every mutating route
  declares its write policy; every tenant router is tenancy-covered.
