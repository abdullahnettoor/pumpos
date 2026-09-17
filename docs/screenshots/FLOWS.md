# PumpOS — Console UI Flows

Minimal navigation map of exercised end-to-end flows, for wiki / customer-flow authoring.
Screenshots: `docs/screenshots/` (numbers referenced below).

## Onboarding & first login

- Invite email → `/accept-invite` → Set password → Continue → Sign in `[01–02]`
- Dashboard (pre-setup) → **Onboard your station** → 9-step wizard `[03–12]`:
  1. Station Basics (name, code, address, phone)
  2. Business Rules (timezone, business-day start, 24/7 or weekly schedule)
  3. Fuels & Rates (quick-add Petrol/Diesel, unit L/kg)
  4. Tanks (quick-add per fuel, capacity)
  5. Dispensers & Nozzles (dual/quad/custom, nozzle→tank mapping)
  6. Opening / Current Values (selling rates, opening stock, landed cost)
  7. Shift Templates (autofill 2/3 shifts)
  8. Payment Terminals (provider quick-add, TID)
  9. Review & Provision → **Go live** `[13]`
- Draft autosaves; can leave and resume.

## Shift lifecycle

- Shifts → Active Shift → open form: template, business date, opening cash float,
  opening nozzle readings (first shift only), attendant→DU assignment, POS→DU assignment
  → **Start Shift Operations** `[15–17, 37]`
- Active shift quick actions: Add Expense (E) · Log Collection (C) · Merchandise Sale (M) · Add Purchase (P)
- Shifts → Active Shift → **Record Handover** (per DU): closing readings + testing,
  POS card/UPI batch, customer (credit) sales, cash deposit → Save `[29, 38–39]`
- Shifts → Active Shift → **Begin Close** → 4-step wizard:
  Cash Reconciliation → Physical Dip Readings (optional) → Review Warnings (acknowledge) →
  Confirm → **Close Shift** `[30–35, 40–42]`
- Post-close: Save Tank Dips (separate action) · View Compiled Shift Summary (immutable) `[36, 43]`

## Business day & reporting

- Shifts → Business Day → live day composition (shifts, collections, credit, purchases, P&L)
  → **Close business day** → seals immutable DSSR `[44–46]`
- Reports → Daily DSSR → generate by date / open from Recent DSSRs → DSSR detail
  (P&L, fuel by product, nozzle aggregation, dip variance, included shifts; Save PDF / Print) `[47–48]`

## Sales & CRM

- Customers → Customer Registry → **Add Customer** (Regular / Credit / Fleet; settlement cycle,
  credit limit, opening balance, GST) `[21–22]`
- Customers → Collections → **Add Collection** (method: cash/card/UPI/bank; customer; amount) `[28]`
- Customers → Credit Sales — receivables issued via handover chits appear here
- Customers → Vehicles — fleet vehicle registry

## Purchasing

- Purchases → Supplier Registry → **Add Supplier** (GST, opening payable) `[23]`
- Purchases → Intakes & Drops → **Add Purchase**: supplier, Fuel/Other line items,
  qty + total (derives rate), tank-drop allocation, optional pay-now, invoice ref `[24–25]`
- Purchases → Record Payment (supplier dues)

## Inventory

- Inventory → Tank Status (stock, capacity %, low/oversold KPIs) `[26]`
- Inventory → Merchandise Stock · Stock Movements · Reconciliations · Reconcile Stock

## Finance

- Accounts → account list (Cash in Hand, Bank, Card/UPI Clearing) · **Transfer** · **New Account** `[49]`
- Expenses → **Add Expense** (category, amount, paid-from) · Ledger · By Category · Categories `[27, 50]`
- Income → **Add Income** (category, amount, received-into) · Income Ledger · GST on Income `[51]`
- Pricing → Fuels: **Record a Fuel Rate** (rate, effective from) · price history `[52]`

## Setup

- Station Overview → General Info · Business & Branding · Products Catalog · Storage Tanks ·
  Dispenser Units · Payment Terminals · Shift Templates `[53]`
- Organization → Stations · Team (invite) · Activity · Profile `[54]`

## Products catalog

- Station Overview → Products Catalog → **Add Product** (name, code, type, inventory engine
  bulk/item/none, sales unit, brand, price, tax category, GST/VAT, HSN) `[56]`
- Station Overview → Products Catalog → **Import CSV** → choose file → per-row validation preview
  → Import N products (invalid rows skipped with reason) `[57–58]`

## Merchandise sales (in shift)

- Shifts → Active Shift → **Merchandise Sale (M)**: sold-by employee, multi-item lines
  (price auto from catalog), payment Cash/Card/UPI/Credit, optional customer account,
  walk-in buyer details + "save as returning customer" `[69–71]`
- Credit merch sale requires a customer account; billed immediately as receivable
- Shifts → Active Shift → Merchandise Handovers → **Record Closing**: employee's *unbilled*
  bulk items at shift end (billed collectively; card/UPI portion split out; billed quick-sales
  shown read-only alongside) `[73]`
- Cash-reconciliation step includes "non-attendant merchandise cash" line at close `[74]`

## Vehicles & opening balances

- Customers → Vehicles → **Add Vehicle** (customer, registration, type, default fuel) `[61]`
- Opening balances: Add Customer / Add Supplier → "Opening Balance (Optional)" (opening
  receivable/payable, kept out of sales/P&L; visible in account statement) `[59–60]`
- Accounts → New Account → "Opening Balance (₹)" seeds the ledger

## Accounts & transfers

- Accounts → **New Account** (Bank / Petty Cash / Cash in Hand / Card-UPI Clearing /
  OMC CMS / Owner; bank metadata; opening balance) `[63]`
- Accounts → **Transfer** (from → to, amount, notes) — e.g. POS clearing → bank settlement
  at 0 MDR `[64]`

## Expense categories

- Expenses → **Categories** → New category → Add (custom category usable immediately in
  Add Expense, paid-from any account) `[65]`

## Team & roles

- Organization → Team → **Add Team Member**: name, enable app access, login with phone/email,
  custom password (Generate/Copy), system role (Owner/Manager/Accountant/Staff/Attendant),
  station assignment `[66–68]`
- Role nav visibility: Manager = all but Organization · Accountant = no Pricing/Setup ·
  Staff = Dashboard, Shifts, Customers, Expenses, Income only `[77–79]`

## Global chrome

- Top bar: business-day switcher · station name · search (⌘K) · **+ New** quick-create ·
  notifications · sync status (Live) · account menu
- Sidebar: Operations / Sales & CRM / Purchasing / Finance / Setup groups
