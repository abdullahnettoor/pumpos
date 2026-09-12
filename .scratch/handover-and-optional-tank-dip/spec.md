# Transactional Handover and optional Tank Dip

Status: Ready for agent

Labels: ready-for-agent

## Problem Statement

An Attendant's Handover is one logical business action, but PumpOS currently
implements it as several unrelated database writes in an HTTP route. The route
deletes the previous Handover, inserts its replacement, inserts Payment Terminal
entries, and updates Nozzle Readings without one transaction. A failure can leave
the Shift with a new Handover and only some of its related readings. The action
also bypasses the core domain and does not publish `HANDOVER_RECORDED`.

The Handover route trusts `expectedSales` and `varianceAmount` calculated by the
client. Those figures can be stale, manipulated, or calculated from data that
changed after the drawer opened. PumpOS can therefore persist a zero Handover
Variance even when authoritative Nozzle Readings, Product Sales, Credit Sales,
OMC Card Sales, or Payment Terminal declarations show a discrepancy.

Shift close also advertises optional Tank Dip input, but its core command does
not accept that input. Validation silently removes the readings. The Shift
closes without recording the Tank Dip, Stock Variance, Stock Movement, or
Business Events, while the operator reasonably believes the readings were
saved.

Tank Dip is optional. It is a Business Day inventory observation, not a
prerequisite for closing every Shift. Coupling it to Shift close would make the
Shift interface own an unrelated optional action and would blur the existing
Business Day and Shift anchoring rules.

## Solution

PumpOS will add one core Handover command as the authoritative seam for recording
or replacing an Attendant's Handover. It will validate the Shift, Attendant,
Dispenser, Nozzles, and Payment Terminals; derive reconciliation from trusted
records and submitted declarations; persist the whole Handover atomically; and
publish `HANDOVER_RECORDED` in the same transaction.

The client may continue to show a live reconciliation preview. The preview is
advisory. The server recomputes the result and returns the accepted values. The
UI replaces its preview with that response after a successful write.

Tank Dip will use the existing stock-count command as a separate seam. The close
workflow may offer an optional "Record Tank Dip" action, but Shift close will not
accept or persist Tank Dip input. A recorded Tank Dip belongs to the Business
Day, may optionally carry Shift attribution when the caller supplies it, and is
included in DSSR through the Business Day's Stock Variance records.

These are two independent seams:

1. Record Handover for Attendant accountability within an open Shift.
2. Record Stock Count for optional Tank Dip and inventory reconciliation within
   a Business Day.

## User Stories

1. As an Attendant, I want my Handover saved as one action, so that a connection or database failure cannot leave half of it recorded.
2. As an Attendant, I want to declare Drawer cash, Payment Terminal totals, and Nozzle Readings together, so that my Shift accountability has one accepted result.
3. As an Attendant, I want the server to return the accepted expected sales and Handover Variance, so that I know the final recorded result.
4. As an Attendant, I want clear validation when a Closing Reading is below its Opening Reading, so that I can correct the reading before submission.
5. As an Attendant, I want testing volume checked against metered volume, so that calibration fuel cannot exceed the fuel dispensed through a Nozzle.
6. As an Attendant, I want Credit Sales and OMC Card Sales derived from recorded sales, so that I do not have to re-enter their totals in the Handover.
7. As an Attendant, I want Payment Terminal totals derived from terminal-level entries when terminals are available, so that aggregate card and UPI declarations cannot drift from their detail.
8. As an Attendant at a Station without configured Payment Terminals, I want to declare aggregate card and UPI amounts, so that the Handover remains usable.
9. As an Attendant, I want to correct my Handover while the Shift remains open, so that a mistaken declaration can be replaced safely.
10. As a Manager, I want exactly one current Handover per Shift, Attendant, and Dispenser, so that reports do not contain duplicate declarations.
11. As a Manager, I want a Handover rejected after the Shift closes, so that historical accountability does not change outside an explicit reopen workflow.
12. As a Manager, I want submitted Nozzles to belong to the selected Dispenser and Shift, so that readings cannot be attached across equipment or Stations.
13. As a Manager, I want submitted Payment Terminals to belong to the Station and be valid for the Handover context, so that another Station's terminal cannot be referenced.
14. As an Owner, I want every accepted Handover to emit `HANDOVER_RECORDED`, so that the Activity Group and audit trail show who declared it and where.
15. As an Owner, I want replacement of a Handover to remain auditable, so that a later declaration does not erase the fact that the action occurred.
16. As an Owner, I want Handover reconciliation calculated from authoritative records, so that a modified client cannot hide a Variance.
17. As an Owner, I want Handover persistence and its Business Event committed together, so that the audit trail cannot disagree with operational state.
18. As a Staff user, I want the Handover preview to update as declarations change, so that I can spot a likely discrepancy before submission.
19. As a Staff user, I want the saved server result to replace the local preview, so that stale UI data does not appear authoritative.
20. As an operator, I want Tank Dip to remain optional, so that I can close a Shift when no physical dip is required.
21. As an operator, I want to record a Tank Dip independently of Shift close, so that I can measure stock at any useful point in a Business Day.
22. As an operator, I want the system to derive the Tank's product, so that I cannot submit a Tank Dip against a mismatched product.
23. As an operator, I want to supply a reason for a Tank Dip Variance, so that the physical discrepancy has operational context.
24. As a Manager, I want a Tank Dip to record expected stock, actual stock, and Variance immediately, so that the discrepancy is visible before reporting.
25. As a Manager, I want a non-zero Tank Dip Variance to adjust book stock through a Stock Movement, so that inventory reconciles to measured stock.
26. As an Owner, I want Tank Dip and Variance Business Events committed with the inventory records, so that inventory adjustments remain auditable.
27. As an Owner, I want DSSR to include any Tank Dips recorded for the Business Day, so that day reporting reflects optional physical checks without making them mandatory.
28. As an Owner, I want Shift Summary to remain immutable after Shift close, so that a later Business Day Tank Dip does not rewrite a historical Shift Summary.
29. As a multi-Station Owner, I want Handover and Tank Dip validation scoped by Organization and Station, so that IDs cannot expose or mutate another tenant's records.
30. As an operator with an interrupted network connection, I want retries to be idempotent, so that one accepted Handover or Tank Dip is not duplicated.

## Implementation Decisions

- Add a core Handover module. Its interface accepts declarations and source
  measurements, not client-calculated conclusions.
- The Handover command is the highest test seam for Handover behavior. HTTP,
  Drizzle, and UI code remain adapters around it.
- Run the Handover command through the existing transaction helper so the
  Handover row, Payment Terminal entries, Nozzle Reading updates, and Business
  Event either all commit or all roll back.
- The command supports create and redeclare behavior while the Shift is open.
  It rejects Handover writes for closed or locked Shifts.
- Enforce one current Handover per Organization, Station, Shift, Attendant, and
  Dispenser with a database uniqueness constraint. Use conflict-safe replacement
  inside the transaction instead of unprotected delete-then-insert behavior.
- Preserve immutable Business Events when a declaration is replaced. Every
  accepted command emits one `HANDOVER_RECORDED` Primary Event. Its payload states
  whether the current declaration was created or replaced and includes the
  server-calculated reconciliation values.
- The event captures action-time display values needed by the activity renderer,
  including Attendant and Dispenser names. It follows the existing Activity Group
  and actor-snapshot rules.
- The server derives `cardHandedOver` and `upiHandedOver` from terminal-level
  entries whenever those entries are supplied. A Station without configured
  Payment Terminals may submit aggregate card and UPI declarations.
- The server derives Credit Sale and OMC Card Sale totals from authoritative
  records scoped to the Organization, Station, Shift, Attendant, and Dispenser.
  It does not accept those totals as authoritative request fields.
- The server loads persisted Opening Readings and unit prices, validates submitted
  Closing Readings, and derives gross volume, testing deduction, net volume, and
  expected fuel sales.
- The server validates that every submitted Nozzle belongs to the Handover's
  Dispenser and Shift. It rejects missing, duplicate, cross-Station, and unrelated
  Nozzle IDs rather than skipping them.
- The server validates that testing volume is non-negative and does not exceed
  gross metered volume for its Nozzle.
- The server validates submitted Payment Terminals against the Station and
  current Handover context. It rejects duplicate and cross-Station terminal IDs.
- The server calculates `expectedSales`, declared totals, and `varianceAmount`.
  These values are removed from the authoritative request contract and returned
  in the response.
- The first implementation preserves the currently accepted reconciliation
  formula and paise rounding behavior. Moving the formula to core must not
  silently redefine which Product Sale amounts belong on the expected or declared
  side. If characterization tests expose a contradiction in the current formula,
  stop and resolve that domain rule before changing financial behavior.
- The UI may use the same pure reconciliation logic for its preview when the
  inputs are already available. Sharing preview logic must not replace server
  recomputation or make the client result authoritative.
- The Handover response contains the persisted declaration, terminal details,
  derived totals, expected sales, declared total, Variance, and accepted Nozzle
  Reading results. The response uses the standard success or error envelope.
- Keep optional Tank Dip outside the Shift-close interface. Remove `dipReadings`
  from shared Shift-close payloads, validation, client calls, and any close-only
  presentation that implies the close command saves them.
- Reuse and harden the existing stock-count module for Tank Dip. Do not add a
  second Tank Dip implementation.
- For a Tank Dip, the command accepts Station, Tank, actual quantity, and an
  optional reason. It resolves the Product from the tenant-scoped Tank instead of
  trusting a caller-supplied Product ID.
- A Tank Dip is anchored to the resolved Business Day. Shift attribution remains
  optional and must not affect inventory or Drawer calculations.
- Recording a Tank Dip always writes a Stock Variance observation, including a
  zero Variance. A non-zero Variance also writes the corresponding Stock Movement
  that reconciles book stock to actual stock.
- The Tank Dip and any Variance event share one Activity Group. `TANK_DIP_RECORDED`
  is Primary; `VARIANCE_RECORDED` is Related when the Variance is non-zero.
- The close workflow may show an optional Tank Dip section or action. Saving a
  Tank Dip invokes the stock-count command before Shift close and reports its own
  success or failure. The operator can close the Shift without recording a dip.
- A failed optional Tank Dip does not silently continue as if it was saved. The
  UI keeps the entered values and asks the operator to retry, discard them, or
  close without recording them.
- Shift close does not orchestrate Tank Dip writes. This keeps close retry and
  idempotency independent from inventory observations.
- Shift Summary contains only facts owned by Shift close. DSSR continues to read
  Business Day Stock Variance records and includes any Tank Dips recorded for
  that day.
- Handover and Tank Dip mutations honor the existing optional idempotency key.
  Replaying an accepted command returns its prior result without duplicate rows,
  Stock Movements, or Business Events.
- All lookups and writes scope Organization and Station before returning or
  mutating data. Cross-tenant IDs return not found or forbidden according to the
  repository's established disclosure policy.
- Existing historical Handover rows and Shift Summaries remain unchanged. No
  backfill invents missing reconciliation or Tank Dip facts.

## Testing Decisions

- Test behavior through two core command interfaces: the new Handover command and
  the existing stock-count command. These are the interfaces callers use and the
  highest seams that expose the business behavior.
- Core tests use in-memory adapters, fixed clocks, deterministic IDs, and an
  in-process event store, following current Shift close and inventory test prior
  art.
- Do not assert private helper calls or SQL statement order. Assert returned
  results, persisted records, Stock Movements, Business Events, and rollback at
  the transaction adapter seam.
- Add Handover characterization tests for the current reconciliation formula
  before moving it out of the UI. These tests freeze existing accepted behavior
  while ownership moves to core.
- Handover core tests cover cash-only, terminal-level card and UPI, aggregate
  non-cash fallback, Credit Sales, OMC Card Sales, Product Sales, testing volume,
  positive Variance, negative Variance, and paise rounding.
- Handover core tests prove that request-supplied expected sales or Variance
  cannot override the server result. The final request contract should reject or
  ignore those legacy fields consistently; strict rejection is preferred once
  all first-party clients migrate.
- Handover validation tests cover a missing assignment, wrong Dispenser, wrong
  Station, cross-tenant Shift, unrelated Nozzle, unrelated Payment Terminal,
  duplicate IDs, Closing Reading below Opening Reading, testing above gross
  volume, and writes after Shift close.
- Handover replacement tests prove that one current row remains and that a new
  immutable Business Event records each accepted declaration.
- Transaction integration tests inject failure after each write stage and prove
  that no Handover, terminal detail, Nozzle Reading update, or Business Event
  commits partially.
- Concurrency tests submit two declarations for the same Shift, Attendant, and
  Dispenser and prove that the uniqueness invariant leaves one current Handover.
- API tests verify authorization, tenant scope, standard envelopes, idempotent
  replay, and mapping between the HTTP request and core command.
- UI tests verify that the preview responds to edits, the server result replaces
  the preview after save, validation errors retain entered values, and stale
  server data cannot be presented as accepted.
- Tank Dip core tests extend existing stock-count prior art. They cover zero,
  positive, and negative Variance; optional reason; Business Day resolution at
  the station's Day Start; optional Shift attribution; and event grouping.
- Tank Dip validation tests prove that the Tank determines the Product and that
  cross-tenant, cross-Station, inactive, or unknown Tanks cannot be counted.
- Tank Dip API tests verify atomic Stock Variance, Stock Movement, and Business
  Event persistence plus idempotent replay.
- Shift-close contract tests prove that `dipReadings` is no longer accepted and
  that closing a Shift neither creates nor changes Tank Dip records.
- Reporting tests prove that DSSR includes Business Day Tank Dips whether they
  were recorded before or after a Shift close, while an existing Shift Summary
  remains unchanged.
- Resilience tests prove that queued Handover and Tank Dip commands retain stable
  idempotency keys and do not duplicate effects after replay.

## Out of Scope

- Making Tank Dip mandatory for Shift close or Business Day close.
- Automatically recording a Tank Dip when a Shift closes.
- Recalculating or rewriting historical Shift Summaries, DSSR snapshots, or
  Handover rows.
- Redesigning the accepted Handover accounting formula beyond moving its
  authority to core and protecting it with characterization tests.
- Adding automated tank-gauge hardware integration.
- Adding Tank calibration charts or converting dip height to volume.
- Redesigning Credit Sale, OMC Wallet, Product Sale, or Payment Terminal
  settlement behavior.
- Replacing the existing Stock Movement source of truth.
- Broad refactoring of all Shift read projections or the full client data module.

## Further Notes

- The separate Tank Dip seam is intentional. Optional observations should not
  widen the Shift-close interface or make Shift close responsible for inventory
  reconciliation it may not perform.
- The existing stock-count implementation already records Business Day Stock
  Variance and corresponding events. This work should deepen that module by
  resolving and validating Tank ownership, not replace it.
- The existing DSSR projection already reads Business Day Stock Variance records.
  That supports optional Tank Dip without coupling it to Shift Summary.
- `HANDOVER_RECORDED`, `TANK_DIP_RECORDED`, and `VARIANCE_RECORDED` already exist
  in the Business Event catalog.
- The Activity Group ADR applies. Co-emitted Handover facts are siblings from one
  command, not a fabricated causal chain.
- The current credential-removal change is unrelated to this spec and should be
  reviewed and shipped separately.

## Comments
