# Deferred Work & Open Questions

This is a short index of deferred work, not a second product rulebook. Current
rules are in `AGENTS.md`, `GLOSSARY.md`, and accepted ADRs. Confirm an item is still
open in code and GitHub Issues before planning against it.

## 1. Dealer-held prepaid wallet (product decision still needed)

In Indian fuel retail, prepaid and fleet wallets are frequently owned by the **OMC**
(IOCL/BPCL/HPCL) loyalty/fleet CMS (e.g. XTRAPOWER, SmartFleet, Fleetcard), **not the
dealer**. A dealer-side "top-up" may be meaningless or conflict with the OMC system.

The OMC-CMS fleet-card sale/settlement path is implemented. Separately, Customer
records still have prepaid flags/balance fields and the UI retains a legacy top-up
drawer, but there is no working top-up endpoint. The workflow is not available to
operators and must not be described as supported.

If reconsidered, decide:

- Whether a dealer-held balance is a real customer workflow and who owns its source
  of truth.
- Whether to implement it, migrate away the legacy fields/UI, or first run customer
  discovery. OMC-CMS fleet-card settlement is already a separate supported flow.

## 2. Durable client write outbox and replay

The product target is **Level 2**: online-primary operation with graceful
degradation during transient outages. Core operator actions must not be blocked by
connectivity. This is not cold-start offline-first or multi-day disconnected use
(Level 3, future, dependent on customer demand).

PostgreSQL remains authoritative. The API has a transactional event outbox and
idempotency support, but a durable **client write outbox and replay are not yet
implemented**. Current online/offline indicators reflect connectivity; they do not
prove a write is durably queued or synchronized. Mobile is online-only.

Remaining: local persistence, retry/backoff and replay protocol, honest pending/failed
state, conflict handling for money-sensitive writes, and offline acceptance tests.
See [Phase O](../roadmap/phase-O-offline-sync.md). `AGENTS.md` states the required
operator-facing guarantees.

## 3. Double-entry ledger (deferred)

PumpOS records Office Records on Entry Date and forecourt activity on Business Day
and Shift, but does **not** run a double-entry general ledger. Customer/supplier balances are projections
(Σ debits − Σ credits). A formal GL (chart of accounts, journals) is a later
"Advanced Accounting" module that should **extend**, not replace, the event model.

## 4. Typed API client (candidate improvement)

Screens currently treat API responses as `any` (e.g. the rich `/shifts/status` shape).
A generated or hand-written **typed client** in `@pump/ui/services` would remove this
coupling and catch backend-shape changes at compile time. Pairs well with finishing the
UI refactor.

## 5. Large component refactors (candidate improvement)

The shift-management UI has historically been large. Reassess the current component
structure before splitting it; do not treat the old extraction list as current work.

## 6. Bundle code-splitting (candidate improvement)

Measure current console bundle size and startup performance before adding route-level
dynamic imports or manual chunks.
