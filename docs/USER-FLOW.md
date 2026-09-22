# PumpOS — End-to-End User Flow

A walkthrough of a real station's life in PumpOS, from first login to the daily
report — in the order a real operator does it. Each step names the screen, the
button, and what "done" looks like. Written for both customers learning the app
and agents driving it.

**Screenshots.** Every flow below is captured in `docs/screenshots/` (numbered
`01`–`54`); `docs/screenshots/FLOWS.md` maps each number to its step.

**Navigation model.** The app is a sidebar + top bar + content area:

- **Sidebar groups**: Operations (Dashboard, Shifts, Inventory, Pricing) ·
  Sales & CRM (Customers) · Purchasing (Purchases) · Finance (Accounts,
  Expenses, Income, Reports) · Setup (Station Overview, Organization).
- **Top bar**: station picker · ⌘K search · **+ New** quick-create menu
  (Expense, Income, Collection, Merchandise sale, Purchase, Supplier payment,
  Credit sale, Customer, Team member…) · notifications · user menu.
- **Bottom status bar**: sync state, current business day, current shift.

Most everyday entries can start from **+ New** — the sections below use the
dedicated pages so you also learn where records live afterwards.

**Two anchors to keep in mind** (they explain most of the UI):

- **Business day** — every financial record belongs to one. A fuel day
  commonly runs 06:00 → 06:00.
- **Shift** — an attendant-accountability window for drawer cash. Cash
  entries attach to the shift; card/UPI/bank/credit entries attach to the
  business day (shift optional).

---

## 1. Sign in

1. Open the app → **Sign in to operational console**.
2. Enter **Email or phone** + **Password** → **Sign In**.
3. Invited team members instead follow their email invite link → **Set
   password & continue**.

Done when: dashboard loads. A brand-new organization sees the getting-started
checklist: Create your organization → Onboard your station → Invite your team
→ Add suppliers → Add customers.

## 2. Onboard the station (web console, one time)

Onboarding runs on the **web console** only — the desktop app shows a notice
to finish setup on the web. Sidebar → **Onboarding Setup** opens a full-screen
9-step wizard. Progress is saved as a draft; you can leave and resume.

| Step                        | What you enter                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Station Basics           | Station name, address, contact details                                                            |
| 2. Business Rules           | Timezone, **business-day start time** (e.g. 06:00), 24/7 toggle, tax regime                       |
| 3. Fuels & Rates            | **Add Fuel** for each fuel sold (MS, HSD, XP…) with current rate                                  |
| 4. Tanks                    | One entry per underground tank: fuel, capacity, current stock                                     |
| 5. Dispensers & Nozzles     | **Add Dual (2 Nozzles)** / **Add Quad (4 Nozzles)** per dispenser unit; map each nozzle to a tank |
| 6. Opening / Current Values | Current totalizer reading per nozzle, current tank stock                                          |
| 7. Shift Templates          | Your shift pattern (e.g. Morning 06:00–14:00, Evening, Night)                                     |
| 8. Payment Terminals        | **Add Payment Terminal**: Provider/Acquirer, Terminal ID (TID), label — one per POS machine       |
| 9. Review & Provision       | Summary counts; fix any "Add at least one…" validation, then provision                            |

Done when: the review step provisions the station and the full app unlocks.

Get the values right the first time — nozzle totalizers and tank stock entered
here become the opening baseline for all future reconciliation.

## 3. Build the product catalog (with stock and price)

Sidebar → **Station Overview** → **Products Catalog** tab. Fuels already exist
from onboarding; add merchandise (engine oil, coolant, accessories…).

**One at a time**: **New Catalog Item** → name, code, product type (Lubricant,
Additive, Accessory, Consumable…), unit, tax category ("GST (lubricants /
merchandise)" for most merchandise), GST rate, HSN code, selling price, stock
type **Item (packaged stock)** → **Create Item**.

**Bulk (recommended for a real catalog)**: **Import Products (CSV)** drawer →
**Download sample CSV** → fill columns
`name, code, productType, unit, taxCategory, gstRate, hsnCode, brand,
category, sellingPrice, costPriceExGst, openingStock` → **Choose CSV file** →
**Import N products**. Price and opening stock land in one import.

Done when: Inventory → **Merchandise Stock** shows every item with its opening
quantity.

Later price changes: Sidebar → **Pricing** → **Fuels** tab ("Record a fuel
rate": product, Rate/L, effective-from) or **Merchandise** tab → **Set price**.

## 4. Register customers and suppliers

**Customers** (fleet/credit accounts): Sidebar → **Customers** → **Customer
Registry** tab → **Register New Customer** → name, phone, account type,
settlement cycle, **credit limit**, fleet code, opening due, GSTIN/billing
details; optionally enable prepaid wallet. Add fleet vehicles under the
**Vehicles** tab → **Add Vehicle**.

**Suppliers** (OMC + merchandise vendors): Sidebar → **Purchases** →
**Supplier Registry** tab → **Register New Supplier** → name, contact, GSTIN,
opening balance.

Done when: every regular credit customer and supplier exists — shift
operations pick them from these lists.

## 5. Add the team

Sidebar → **Organization** → **Team** tab → **New Team Member** → name,
email/phone, role → **Add Member**. The member gets an email invite (step 1).

Roles:

| Role       | Use for                                                        |
| ---------- | -------------------------------------------------------------- |
| Owner      | Global admin, sees everything incl. P&L                        |
| Manager    | Runs the station: shifts, setup, day close                     |
| Accountant | Finance entries and reports                                    |
| Staff      | Day-to-day operational entries                                 |
| Attendant  | Mobile-only; accountable for one dispenser unit (DU) per shift |

## 6. Open a shift

Sidebar → **Shifts** → **Active Shift** tab → open-shift form:

1. Pick the **Shift template** and confirm the **Shift Business Date** (it
   defaults correctly for the station's day-start; before 06:00 the date is
   still "yesterday").
2. Enter the **Opening cash float (₹)** handed to the drawer.
3. Assign an **Attendant** to each dispenser unit; **Attach POS** if a
   terminal travels with that DU.
4. Verify **Opening nozzle readings** — they default from the previous close;
   correct only if the pump display disagrees.
5. **Start Shift Operations**.

Done when: the active-shift workspace appears and the status bar shows the
open shift.

## 7. Run the shift

The active-shift workspace is the operator's home during the day. Quick
actions on the shift control bar: **Add Expense (E)** · **Log Collection (C)**
· **Merchandise Sale** · **Add Purchase (P)**. Transactions land in the
tabs: Petty Expenses · Fuel Deliveries (Purchases) · Credit Sales &
Collections.

What happens during a typical shift, and where to record it:

- **Fuel sales** — nothing to type per sale. Fuel volume derives from nozzle
  readings (closing − opening) captured at handover/close. Never enter fuel
  sales manually.
- **Credit sale** (fleet customer fuels without paying): from the attendant
  handover drawer → **Log Credit Sale** → pick customer, vehicle, fuel,
  amount. It debits the customer's ledger — no cash expected in the drawer.
  OMC fleet-card swipes: **Add OMC card sale**.
- **Merchandise sale**: **Merchandise Sale** → product, quantity, payment
  mode. Stock decrements automatically.
- **Customer collection** (customer pays down credit): **Log Collection** →
  customer, amount, mode. Cash collections join the drawer; bank/UPI
  collections need a **Deposit to** account.
- **Petty expense from the drawer**: **Add Expense (E)** → category, amount,
  paid-from. Drawer-cash expenses reduce expected drawer cash.
- **Fuel delivery mid-shift**: **Add Purchase (P)** → supplier, tank,
  quantity, invoice; tick **Record payment now** if paid on the spot.
- **Attendant handover** (attendant ends duty or hands cash to the safe):
  handover dashboard → **Record Handover** → enter the DU's closing nozzle
  readings, count cash by denomination ("Count handover cash by
  denomination"), record card/UPI slips per terminal, list credit sales →
  **Save Handover & Readings**. Small differences between expected and
  counted cash surface here as **variance** per attendant — record the actual
  count; variance is tracked, not hidden. Merchandise attendants use
  **Record Merchandise Handover**.

Done when: every attendant has handed over — all readings, cash counts, and
credit sales are in before you close.

## 8. Close the shift

Active Shift → **Close Shift** — a 4-step wizard:

1. **Cash Reconciliation** — "Count safe cash by denomination". Expected
   drawer cash = opening float + cash sales + cash collections − drawer
   expenses − cash supplier payments − cash drops. Enter the real count;
   the difference is recorded as variance with a reason.
2. **Physical Dip Readings** — enter each tank's dip. Skipping is allowed
   ("Close without recording Tank Dips?") but dips are what catch tank
   variance.
3. **Review Warnings** — read each warning, tick the confirmation.
4. **Confirm Shift Summary** → **Close Shift**.

Done when: the immutable **Shift Summary** appears (nozzle reconciliation,
drawer reconciliation, totals). It never changes afterwards. **Open next
Shift** starts the following window; past shifts live under **History**.

## 9. Day-to-day finance (any time, not shift-bound)

These attach to the business day; a shift is optional ("Target Shift" field).

- **Purchases**: Sidebar → **Purchases** → **Record Purchase** → supplier,
  product lines, invoice; **Record payment now** or pay later via **Record
  Supplier Payment**. Supplier statements: **Supplier Registry** → statement.
  GST input credit sits under the **GST / ITC** tab.
- **Expenses**: Sidebar → **Expenses** → **Log New Expense** → category
  (manage via **Manage expense categories** → **New category**), amount,
  paid-from account. Wrong entry? Void it with a reason — nothing is deleted.
- **Income** (non-fuel income like rent, commissions): Sidebar → **Income** →
  **Record Income**.
- **Collections**: Sidebar → **Customers** → **Collections** tab → **Log
  Customer Collection**. Customer statements: Registry → **Customer Account
  Statement**. Prepaid customers: **Prepaid Wallet Top-Up**.
- **Accounts** (cash, bank, petty cash, card/UPI clearing): Sidebar →
  **Accounts** → **New Account**, **Transfer Money** (e.g. safe cash →
  bank deposit), **Settle to Bank** (clear card/UPI settlements into the
  bank account), **Add Entry** (bank charges, interest, adjustments),
  per-account statements, **Set opening balance**.

## 10. Inventory checks

Sidebar → **Inventory**:

- **Tank Status** — live fuel stock vs capacity.
- **Merchandise Stock** — packaged-item quantities; **Record Intake** for
  stock received outside a purchase.
- **Stock Movements** — the audit trail; every movement, no exceptions.
- **Reconciliations** — **Stock Reconciliation** drawer: physically count,
  enter actual, and the system records expected vs actual variance with a
  reason.

## 11. Close the business day → DSSR

When all of a date's shifts are closed: **Shifts** → **Business Day** tab →
**Close day** → confirm "Close this business day?". This generates the
immutable **DSSR** (Daily Station Sales Report) — all shift summaries plus
the day's collections, expenses, purchases, supplier payments, and credit
sales — and seals the day.

Days close independently: you can close Monday on Friday; an unclosed past
day never blocks today.

Done when: toast "Business day closed · DSSR generated."

## 12. Reports

Sidebar → **Reports**: **Daily DSSR** (generate/view snapshots) · **Profit &
Loss** (Owner) · **Ledger** · **Invoices** · **Tax Register** · **Cash &
Bank** · **Expense Register** · **Attendant Handovers**.

---

## A full day at a glance

```text
06:00  Open Morning shift        (float, attendants, opening readings)
       …fuel flows, metered by nozzles…
09:30  Fuel tanker arrives     → Add Purchase (decant into tank)
11:00  Fleet truck fuels       → handover drawer → Log Credit Sale
12:00  Customer clears dues    → Log Collection
13:00  Tea & sundries paid     → Add Expense (drawer cash)
14:00  Attendants hand over    → Record Handover (readings + cash count)
14:05  Close Morning shift     → 4-step wizard → Shift Summary
14:10  Open Evening shift      → Open next Shift
  ⋮      (repeat per shift)
22:05  Close last shift
22:10  Close business day      → DSSR generated
22:15  Settle to Bank / Transfer Money (bank the day's cash)
```
