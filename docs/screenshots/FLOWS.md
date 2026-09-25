# PumpOS — Console UI Flows

Minimal navigation map of exercised end-to-end flows, for wiki / customer-flow authoring.
Screenshots: `docs/screenshots/` (numbers referenced below). Full narrative: `docs/USER-FLOW.md`.
Captured on the preview console against a freshly onboarded station ("Hilltop Fuels Kozhikode").

## Onboarding & first login

- Invite email → `/accept-invite` → Set password → Sign in `[01]`
- Dashboard (pre-setup) getting-started checklist → **Onboard your station** `[02]`
- Intro "What to have ready" → **Start setup** `[03]` → 9-step wizard:
  1. Station Basics (name, code, address, phone, shift grace period) `[04]`
  2. Business Rules (business-day start, 24/7 or weekly schedule) `[05]`
  3. Fuels & Rates (quick-add Petrol (MS) / Diesel (HSD)) `[06]`
  4. Tanks (quick-add per fuel, capacity) `[07]`
  5. Dispensers & Nozzles (Add Dual / Quad / Custom; auto nozzle→tank mapping) `[08]`
  6. Opening / Current Values (selling rates, opening stock, landed cost) `[09]`
  7. Shift Templates (Autofill 2/3 shifts) `[10]`
  8. Payment Terminals (provider quick-add, N machines) `[11]`
  9. Review & Provision `[12]` → **Go live** `[13]` → live dashboard `[14]`

## Catalog, CRM, purchasing setup, team

- Station Overview → Products Catalog → **Import CSV**: choose file → validated preview →
  **Import N products** (price + opening stock in one file) `[16–18]`
- Customers → Customer Registry → **Add Customer** (Regular / Credit / Fleet; credit limit,
  fleet code, GST) `[19–21]`
- Purchases → Supplier Registry → **Add Supplier** `[22–23]`
- Organization → Team → **Add Team Member** (phone/email + password, role, station
  assignment) `[24–26]`

## Shift lifecycle

- Shifts → Active Shift → open form: template, business date, opening cash float,
  opening nozzle readings, attendant→DU + POS→DU assignment → **Start Shift Operations** `[27–29]`
- Quick actions: Add Expense (E) `[31]` · Log Collection (C) `[37]` · Merchandise Sale (M) `[30]` ·
  Add Purchase (P) — fuel drop with tank allocation `[32]`
- **Record Handover** per DU: closing readings + testing, POS card/UPI batch,
  customer credit sale (chit) `[33]`, cash deposit; live variance preview `[34–36]`
  (DU-2 shows a small cash shortage `[36]`)
- Workspace after 2/2 handovers: variances per attendant, nozzle reconciliation `[38]`
- **Begin Close** → 4-step wizard: Cash Reconciliation `[39]` → Physical Dip Readings `[40]` →
  Review Warnings `[41]` → Confirm `[42]` → **Close Shift** → success + immutable summary `[43–44]`

## Business day & reporting

- Shifts → Business Day → **Close business day** → confirm **Close day** → seals immutable DSSR `[45–47]`
- Reports → Daily DSSR → Recent DSSRs → DSSR detail (P&L, fuel by product, dip variance) `[48–49]`

## Everything else

- Inventory (Tank Status / Merchandise Stock / Movements / Reconciliations) `[50]`
- Accounts (cash, bank, clearing; transfers, settle to bank) `[51]`
- Expenses ledger `[52]` · Pricing (fuel rates + merchandise MRP) `[53]`
- Dashboard after a full day `[54]`
