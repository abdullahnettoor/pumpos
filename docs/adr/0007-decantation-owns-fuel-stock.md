# Decantation owns fuel stock; Fuel Purchases are Office Records

Status: accepted (2026-10-11). Amends the Purchase rule of ADR 0005 for fuel.

## Context

A Purchase adds stock for every line. Fuel lines split the invoice quantity
across tanks (`purchase_items.tank_allocations`). So fuel stock rises by what
the invoice says, not by what reached the tank. Stations record the tanker
unloading (Decantation) as its own event, with dips, density and the
received quantity. The invoice (office work) and the unloading (forecourt
work) often happen at different times.

Research: `docs/research/decantation-and-density.md`.

## Decision

1. **Decantation is the only event that adds fuel stock.** One Decantation
   is one **tanker visit**. It belongs to the Business Day (no Shift) and
   records the tanker, driver and unloading start/end once. It has one or
   more **Tank Lines** (a tanker may split across tanks or carry two
   products). Each Tank Line records its tank, product, dip before
   unloading, RO Density, an optional dip after unloading and sales during
   unloading.
   - **Chamber checks are optional** (hidden behind a checkbox). Each chamber
     records capacity, the Tank Line it emptied into, seal OK, dip mark
     (OK / Short / Excess), optional dip in mm, and emptied. Chamber data
     never moves stock.
2. **Fuel Purchase is an Office Record.** It records the invoice, the payable,
   taxes and rate. It carries an Entry Date (the invoice date), no Business
   Day, and never moves stock. Product (non-fuel) Purchases are unchanged:
   they add stock and stay on the Business Day.
3. **Received quantity is measured, never the invoice quantity.**
   Measured per Tank Line:
   - With an after-unloading dip: after dip − before dip + nozzle sales from
     that tank during unloading.
   - Without it: the next routine Tank Dip of that tank − before dip + nozzle
     sales between the two dips. Until that dip exists the Tank Line is
     _Pending measurement_ and adds no stock; the tank shows "Waiting on
     decantation".
4. **Linking is per product, at the tanker visit.** OMCs invoice per
   product, so a Decantation links at most one Fuel Purchase per product it
   carries — not one per tank. Every Tank Line of that product shares the
   invoice (and its invoice density). Either may be recorded first. A
   product with no linked invoice shows "Purchase not linked"; an unlinked
   Fuel Purchase shows "Awaiting decantation".
5. **Variance is per invoice.** Σ received of that product's Tank Lines −
   invoice quantity is an Excess or Short Variance, computed once linked and
   every line is measured. Stock is still added per tank. Nothing ever
   blocks; these flag the Decantation for Owner review: density outside
   tolerance (RO vs invoice density, per Tank Line), a Short chamber or
   broken seal (`TANKER_SHORT`), a chamber not emptied after unloading
   (`CHAMBER_NOT_EMPTIED`), an after dip before the settling time. Chamber
   Excess and Σ chambers ≠ invoice quantity only warn.
6. **Cost.** Weighted-average cost is updated when the Decantation adds stock,
   at invoice value ÷ received quantity.
7. **Settings.** Density method, density tolerance, quantity tolerance and
   settling time are station settings with defaults. Settling time only
   warns on an early after-unloading dip.
8. **Day close** warns (never blocks) on Pending measurement or unlinked
   Decantations.
9. Recording density and Decantations: Manager, Accountant, Owner.

## Consequences

- UI: one drawer, accordion stepper (Tanker & invoices → Tanks → Tanker
  chambers → Unloading → After unloading → Review); finished steps collapse
  to compact cards. Prototype: branch `prototype/decantation-ui`, variant E.

- Fuel lines lose the tank picker; `tank_allocations` is no longer written
  for fuel. No migration: there is no production data.
- Purchases now carry two anchors (fuel: Entry Date; products: Business Day);
  lists and reports must handle both.
- Fuel stock can lag sales until the Decantation is measured; this is shown,
  not hidden.
