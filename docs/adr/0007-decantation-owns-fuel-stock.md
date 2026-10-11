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

1. **Decantation is the only event that adds fuel stock.** It belongs to the
   Business Day (no Shift), records the tank, the dip before unloading,
   observed density (RO Density), unloading start and end, and an optional
   dip after unloading.
2. **Fuel Purchase is an Office Record.** It records the invoice, the payable,
   taxes and rate. It carries an Entry Date (the invoice date), no Business
   Day, and never moves stock. Product (non-fuel) Purchases are unchanged:
   they add stock and stay on the Business Day.
3. **Received quantity is measured, never the invoice quantity.**
   - With an after-unloading dip: after dip − before dip + nozzle sales from
     that tank during unloading.
   - Without it: the next routine Tank Dip of that tank − before dip + nozzle
     sales between the two dips. Until that dip exists the Decantation is
     _Pending measurement_ and adds no stock; the tank shows "Waiting on
     decantation".
4. **Linking.** One Fuel Purchase (one product per OMC invoice) links to one
   or more Decantations of that product. Either may be recorded first. An
   unlinked Decantation shows "Purchase not linked"; an unlinked Fuel
   Purchase shows "Awaiting decantation".
5. **Variance.** Received − invoice quantity is an Excess or Short Variance,
   computed once both are linked and measured. Density outside tolerance
   (received vs invoice density) never blocks: the user is warned and the
   Decantation is flagged for Owner review.
6. **Cost.** Weighted-average cost is updated when the Decantation adds stock,
   at invoice value ÷ received quantity.
7. **Settings.** Density method, density tolerance, quantity tolerance and
   settling time are station settings with defaults. Settling time only
   warns on an early after-unloading dip.
8. **Day close** warns (never blocks) on Pending measurement or unlinked
   Decantations.
9. Recording density and Decantations: Manager, Accountant, Owner.

## Consequences

- Fuel lines lose the tank picker; `tank_allocations` is no longer written
  for fuel. No migration: there is no production data.
- Purchases now carry two anchors (fuel: Entry Date; products: Business Day);
  lists and reports must handle both.
- Fuel stock can lag sales until the Decantation is measured; this is shown,
  not hidden.
