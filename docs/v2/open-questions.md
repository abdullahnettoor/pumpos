# Open Questions & Deferred Decisions

Tracked decisions that are intentionally not built yet. Resolve before implementing.

## 1. Prepaid / fleet wallet top-up (needs discovery)

In Indian fuel retail, prepaid and fleet wallets are frequently owned by the **OMC**
(IOCL/BPCL/HPCL) loyalty/fleet CMS (e.g. XTRAPOWER, SmartFleet, Fleetcard), **not the
dealer**. A dealer-side "top-up" may be meaningless or conflict with the OMC system.

Decisions required:
- **Ownership:** dealer-managed prepaid (our ledger authoritative) vs OMC-CMS-managed
  (we mirror / only record a charge against an external balance)?
- **Integration mode:** manual entry, file/CSV reconciliation, or live OMC API? (Most
  dealers have no API; reconciliation files are common.)
- **What we record:** if OMC-owned, likely only a `Prepaid Charge` (a sale settled against
  an external wallet), never a `Prepaid Top-up`; the balance becomes informational.
- **Card-present overlap:** fleet cards usually authorize at the POS terminal — this
  overlaps the **payment terminal** model, not a separate wallet.

**Current state:** deferred. The UI `topupCustomer(...)` calls an unimplemented endpoint.
**Likely v2 path:** model fleet card settlement as `paymentMethod: 'FleetCard'` on
`CreateSale` (settles like card, no drawer impact) rather than a dealer wallet — unless
discovery shows dealers genuinely run their own prepaid.

## 2. Offline-first + sync (deferred)

PostgreSQL is authoritative; SQLite is a planned operational cache (desktop only; mobile
does not get offline). The event backbone + idempotency keys are designed so offline slots
in later with **no domain change**:
- Create event locally → store → retry sync → cloud confirmation.
- Every sync operation must be idempotent (the `Idempotency-Key` mechanism + unique
  `event_id` already support replay-safety).

Open: conflict resolution policy, local store schema, sync cursor/queue, and the Tauri
SQLite seam (see [desktop-patterns.md](desktop-patterns.md)).

## 3. Double-entry ledger (deferred)

v2 emits financial events and anchors everything to the business day, but does **not** run
a double-entry general ledger. Customer/supplier balances are projections
(Σ debits − Σ credits). A formal GL (chart of accounts, journals) is a later
"Advanced Accounting" module that should **extend**, not replace, the event model.

## 4. Typed API client (recommended)

Screens currently treat API responses as `any` (e.g. the rich `/shifts/status` shape).
A generated or hand-written **typed client** in `@pump/ui/services` would remove this
coupling and catch backend-shape changes at compile time. Pairs well with finishing the
UI refactor.

## 5. ShiftsManagement structural split (in progress)

The remaining large blocks should be extracted **with the dev server running** for visual
verification. See [ui-assessment.md](ui-assessment.md) item #1.

## 6. Bundle code-splitting (deferred)

The web bundle is ~1 MB (single chunk). Add route-level dynamic `import()` /
`build.rollupOptions.output.manualChunks` when load time matters.
