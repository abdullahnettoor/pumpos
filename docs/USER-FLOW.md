# PumpOS — End-to-End User Flow

A walkthrough of a real station's life in PumpOS, from first login to the daily
report — in the order a real operator does it. Each step names the screen, the
button, and what "done" looks like. Written for both customers learning the app
and agents driving it.

**Screenshots.** Every flow below is captured in `docs/screenshots/` (numbered
`01`–`54`); `docs/screenshots/FLOWS.md` maps each number to its step.

**Navigation model.** The app is a sidebar + top bar + content area:

- **Sidebar groups**: Operate (Dashboard, Shifts, Inventory, Pricing) ·
  Parties (Customers, Suppliers) · Books (Accounts, Expenses, Income) ·
  Insight (Reports) · Setup (Station, Organization). Each page opens on its
  main list tab.
- **Top bar**: station picker · ⌘K search · **+ New** quick-create menu
  (Expense, Income, Collection, Merchandise sale, Purchase, Supplier payment,
  Credit sale, Customer, Team member…) · notifications · user menu.
- **Bottom status bar**: sync state, current business day, current shift.

Most everyday entries can start from **+ New** — the sections below use the
dedicated pages so you also learn where records live afterwards.

This describes the **web/desktop console**. The phone app has its own
navigation (a bottom dock, no sidebar): see
[13. The mobile app](#13-the-mobile-app).

**Two anchors to keep in mind** (they explain most of the UI):

- **Business Day** — the station's sales day, starting at its configured Day
  Start. Forecourt Sales, Cash Drops, and purchases/stock events use this anchor.
- **Shift** — an attendant-accountability window for each Dispenser Unit's
  Drawer. Every Sale and Cash Drop is also tied to a Shift.
- **Entry Date** — station-timezone calendar date for Office Records such as
  Collections, Supplier Payments, Expenses, Income, and bank work. It is not
  rolled back at Day Start and has no Shift or Business Day (ADR 0005).

---

## 1. Sign in

1. Open the app → **Sign in to operational console**.
2. Enter **Email or phone** + **Password** → **Sign in**.
3. Invited team members instead follow their email invite link → **Set
   password & continue**.

Done when: dashboard loads. A brand-new organization sees the getting-started
checklist: Create your organization → Onboard your station → Invite your team
→ Add suppliers → Add customers.

## 2. Onboard the station (web console, one time)

Onboarding runs on the **web console** only — the desktop app shows a notice
to finish setup on the web. Sidebar → **Onboarding setup** opens a full-screen
9-step wizard. Progress is saved as a draft; you can leave and resume.

| Step                        | What you enter                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Station basics           | Station name, address, contact details                                                                                 |
| 2. Business rules           | Timezone, **business-day start time** (e.g. 06:00), 24/7 toggle, tax regime                                            |
| 3. Fuels & rates            | **Add fuel** for each fuel sold (MS, HSD, XP…) with current rate                                                       |
| 4. Tanks                    | One entry per underground tank: fuel, capacity, current stock                                                          |
| 5. Dispensers & nozzles     | **Add dual (2 nozzles)** / **Add quad (4 nozzles)** per dispenser unit; map each nozzle to a tank                      |
| 6. Opening / current values | Current selling rate per fuel; opening stock and purchase rate per tank (nozzle readings come at the first shift open) |
| 7. Shift templates          | Your shift pattern (e.g. Morning 06:00–14:00, Evening, Night)                                                          |
| 8. Payment terminals        | **Add terminal**: Provider/acquirer, Terminal ID (TID), label — one per POS machine                                    |
| 9. Review & provision       | Summary counts; fix any "Add at least one…" validation, then provision                                                 |

Done when: the review step provisions the station and the full app unlocks.

Get the values right the first time — nozzle totalizers and tank stock entered
here become the opening baseline for all future reconciliation.

## 3. Build the product catalog (with stock and price)

Sidebar → **Station** → **Products** tab. Fuels already exist
from onboarding; add merchandise (engine oil, coolant, accessories…).

**One at a time**: **Add ▾ → Product** opens **New catalogue item** → name, code, product type (Lubricant,
Additive, Accessory, Consumable…), unit, tax category ("GST (lubricants /
merchandise)" for most merchandise), GST rate, HSN code, selling price, stock
type **Item (packaged stock)** → **Create item**.

**Bulk (recommended for a real catalog)**: **Import products (CSV)** drawer →
**Download sample CSV** → fill columns
`name, code, productType, unit, taxCategory, gstRate, hsnCode, brand,
category, sellingPrice, costPriceExGst, openingStock` → **Choose CSV file** →
**Import N products**. Price and opening stock land in one import.

Done when: Inventory → **Product stock** shows every item with its opening
quantity.

Later price changes: Sidebar → **Pricing** → **Fuels** tab ("Record a fuel
rate": product, Rate/L, effective-from) or **Products** tab → **Set price**.

## 4. Register customers and suppliers

**Customers** (fleet/credit accounts): Sidebar → **Customers** → **Customers**
tab → **Register new customer** → name, phone, account type,
settlement cycle, **credit limit**, fleet code, opening due, GSTIN/billing
details. Add fleet vehicles under the **Vehicles** tab → **Add vehicle**. Customer
records may show legacy prepaid fields; dealer-held prepaid wallet top-up/drawdown
is not a supported workflow.

**Suppliers** (OMC + merchandise vendors): Sidebar → **Suppliers** →
**Suppliers** tab → **Register New Supplier** → name, contact, GSTIN,
opening balance.

Done when: every regular credit customer and supplier exists — shift
operations pick them from these lists.

## 5. Add the team

Sidebar → **Organization** → **Team** tab → **New Team Member** → name,
email/phone, role → **Add Member**. The member gets an email invite (step 1).

Roles:

| Role       | Use for                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| Owner      | Global admin, sees everything incl. P&L                                       |
| Manager    | Runs the station: shifts, setup, day close                                    |
| Accountant | Finance entries and reports                                                   |
| Staff      | Day-to-day operational entries                                                |
| Attendant  | Mobile-only (handover app); accountable for one dispenser unit (DU) per shift |

### Custom permissions (Owner only)

Each Role has default Permissions (the full matrix is in
`packages/shared/src/permissions/permission-matrix.generated.md`). An Owner can
give or take away single abilities for one member without inventing a role:
Sidebar → **Organization** → **Team** tab → the member → **Permissions**.
Areas expand to switches; the header shows "Role defaults" or "N custom", and
**Reset to role defaults** clears every change. **Save** applies it.

- **Changing a Role** warns that the member's custom changes may be dropped
  because the new Role's defaults apply; confirm to continue.
- **Plan note:** Custom permissions is a plan feature. Without it the drawer is
  read-only with an upgrade note, and existing changes are kept but not applied.
- Sensitive figures follow Permissions, not just screens: without **View
  purchase prices / costs** the server withholds purchase amounts, product cost
  price, stock-variance unit cost and stock-loss rupee value; without **View
  margin** it withholds COGS and margin.

## 6. Open a shift

Sidebar → **Shifts** → **Live shift** tab. With no shift open it shows today
so far and what closed last; **Open shift** (top right) shows the open-shift
form:

1. Pick the **Shift template** and confirm the **Shift business date** (it
   defaults correctly for the station's day-start; before 06:00 the date is
   still "yesterday").
2. Assign an **Attendant** to each dispenser unit and enter the **Opening
   float (₹)** handed to that attendant's pouch (0 is fine); **Attach POS** if
   a terminal travels with that DU. The shift's opening cash is the sum of the
   floats.
3. Check **Rates for this shift**: each fuel sells at its current price for
   the whole shift. A fuel marked **No rate in effect** blocks the open until
   an Owner or Manager sets one with **Change price**.
4. Verify **Opening nozzle readings** — they default from the previous close;
   correct only if the pump display disagrees.
5. **Start shift operations**.

Done when: the active-shift workspace appears and the status bar shows the
open shift.

## 7. Run the shift

The Live shift tab is the operator's home during the day: the shift bar (Live,
running time, scheduled end, handovers done), four "This shift" tiles (Fuel
sold · Sales · Card / UPI / credit · Drawer variance), the **Nozzle readings**
grouped by attendant and the **Product sales** per employee, with the takings
and a **Before close** checklist on the right. **Record ▾** (top right, on
every tab) holds **Product sale (M)** and the Office Records: **Expense (E)** ·
**Collection (C)** · **Purchase (P)**.

What happens during a typical shift, and where to record it:

- **Fuel sales** — nothing to type per sale. Fuel volume derives from nozzle
  readings (closing − opening) captured at handover/close. Never enter fuel
  sales manually.
- **Credit sale** (fleet customer fuels without paying): from the attendant
  handover drawer → **Log Credit Sale** → pick customer, vehicle, fuel,
  amount. It debits the customer's ledger — no cash expected in the drawer.
  OMC fleet-card swipes: **Add OMC card sale**.
- **Product sale** (a Billed Sale): **Record ▾ → Product sale** → product,
  quantity, payment mode. Stock decrements automatically.
- **Customer collection** (customer pays down credit): **Record collection (C)**
  opens the **Record collection** drawer: entry date, customer (required: there is
  no walk-in), method, amount, and the **Funding account** it landed in (Cash
  in Hand / Petty Cash for cash; a bank for a transfer; for card/UPI either a
  bank or the payment terminal, which posts to its clearing account). It is
  office money: it never touches the drawer, and the drawer title never
  names the shift ("Office record · not part of <shift>").
- **Petty expense**: **Record expense (E)** opens the drawer: entry date,
  category, amount, Funding account (e.g. Petty Cash). Office money: it never
  touches the drawer. Cash taken out of a drawer for it is a cash drop.
- **Fuel delivery mid-shift**: **Record purchase (P)** opens the drawer:
  Fuel, invoice date, supplier, invoice lines (fuel stock moves only when the
  tanker is decanted); tick **Also record a supplier payment now** if paid on
  the spot, then pick the account and check the **Payment date** (the
  invoice date until you change it). A product purchase opened here still
  reads "Product purchase · Business Day <date>": it adds stock to the day.
- **Attendant handover** (attendant ends duty or hands cash to the safe):
  Nozzle readings → the attendant's row → **Record handover** → enter the DU's closing nozzle
  readings, count the whole pouch by denomination ("Count handover cash by
  denomination") — float included — enter any **Cash Drops** taken from the
  pouch mid-shift, record card/UPI slips per terminal, list credit sales →
  **Save handover & readings**. The drawer's **Reconciliation** reads expected
  in drawer = opening float + fuel cash + **Product sales (cash)** − cash drops;
  the difference from the counted cash is that attendant's **variance**
  (Balanced, +₹… surplus, −₹… short) — record the actual count; variance is
  tracked, not hidden. Products sold without a bill go on the employee's
  **Handover Product Sale** (Product sales → **Record**, or **Edit** on the
  Product sales (cash) line in the handover). It is sold at each product's
  MRP: a line whose product has none reads **No MRP set** and blocks the save.
  An Owner or Manager sets it from the line (**Set MRP**); anyone else asks
  them to.

Done when: every attendant has handed over — all readings, cash counts, and
credit sales are in before you close.

## 8. Close the shift

Live shift → **Close shift** (top right; **Continue close** once started)
opens the Close shift page (`/shifts/<id>/close`). Its step is in the
address and what you enter is kept, so a reload or an accidental Back
resumes it. A sticky footer shows expected vs counted office cash.

1. **Readings** — every nozzle's closing reading, under its Drawer. A drawer
   that has not handed over reads blank: **Record handover** opens the
   Handover drawer on top of the page. Optional **Tank dips** sit here too
   ("Close without recording tank dips?").
2. **Handovers** — one row per Drawer: float, cash sales, drops, expected,
   declared and variance. Every drawer must hand over before the shift
   closes; **Record** opens the missing handover.
3. **Cash count** — expected office cash = Σ opening floats + cash declared −
   drops (collections, expenses and supplier payments are office money, never
   drawer cash). Add any **Drops at close**, then enter the real count ("Count
   safe cash by denomination"); the office count variance is shown at once.
4. **Confirm** — the summary and any warnings to acknowledge → **Close shift**.

Done when: the page shows **<Shift> closed** — the immutable **Shift
Summary** is saved (nozzle reconciliation, drawer reconciliation, totals) and
never changes afterwards. **Open next shift** starts the following window;
**View shift summary** opens it under **History**.

## 9. Day-to-day finance (any time, not shift-bound)

Office Records carry an **entry date** (today by default; past dates
allowed, never future) and the **Funding account** the money moved through.
They never attach to a shift or business day. Product purchases are the
exception: they are stock events on the Business Day. A fuel purchase is
dated by its invoice; its stock comes from Decantation.

Every Office Record opens the same drawer, whether from its page, **+ New**,
a customer or supplier statement (the party is then fixed) or the shift bar:
one title per kind (**Record expense**, **Record income**, **Record
collection**, **Record purchase**, **Record supplier payment**), the fields in
the order date → who/what → amount → **Funding account** → reference, and a
pinned footer with **Add another after saving**, **Cancel** and the record
button (⌘/Ctrl+Enter). The strip above the footer previews the record: the
balance it moves and a check chip (**Possible repeat**, **Goes negative**,
**Advance**, or **No issues**); click it for the full preview. On a window
1600px or wider the preview sits beside the form. Checks warn; they never
block a save. If a save fails without an answer, saving again sends the same
record, so it cannot be recorded twice. If you edit after such a failure and
the save is refused, the first save may already be in: check the list, then
undo your edit or close and start again.

- **Purchases**: Sidebar → **Suppliers** → **Purchases** tab → **Record
  purchase** → Fuel or Products (one invoice can't mix them; fuel is dated by
  its invoice, products by their Business date), supplier, invoice lines.
  Tick **Also record a supplier payment now** to save a Supplier payment with
  it in one go: pick the account, the amount (the invoice total until you
  change it) and the **Payment date**, the payment's Entry Date. It starts at
  the purchase's date; for a product purchase on today's Business Day it is
  today's calendar date, even before Day Start. Or pay later with **Record supplier payment** (on the page or
  in **+ New**, which opens the drawer in place). Supplier statements:
  **Suppliers** tab → statement. GST input credit is in **Reports → GST →
  Purchases (ITC)**.
- **Expenses**: Sidebar → **Expenses** → **Record expense** → entry date,
  category, amount, Funding account. Owners, Managers and Accountants can add
  a category from the picker (**+ New category…**) or manage them under
  **Categories**. Wrong entry? Void it with a reason — nothing is deleted.
- **Income** (non-fuel income like rent, commissions): Sidebar → **Income** →
  **Record income** (Staff can also start it from **+ New**). **By category** totals income per category; output GST
  on income is in **Reports → GST → Income** (Staff, who have no Reports,
  see it on the Income page's **GST** tab).
- **Collections**: Sidebar → **Customers** → **Collections** tab → **Log
  Customer Collection**. Customer statements: **Customers** tab → **Customer Account
  Statement**. OMC-CMS fleet-card settlement is supported; customer-owned
  prepaid wallet top-up/drawdown is not currently available.
- **Accounts** (cash, bank, petty cash, card/UPI clearing): Sidebar →
  **Accounts** → **New account**, **New transfer** (e.g. safe cash →
  bank deposit). Click an account to open its own page (`#/accounts/<id>`,
  with its statement period in the address): **Add entry** (bank charges,
  interest, adjustments, **Set opening balance**) and, for a card/UPI
  clearing account, **Settle to bank**. **‹ Accounts** (top-left), browser
  Back or Alt+← return to the list where you left it. The **Daily cash book** tab
  shows each account's opening, in, out and closing for one entry date, live.

## 10. Inventory checks

Sidebar → **Inventory**:

- **Tanks** — live fuel stock vs capacity.
- **Decantations** — tanker unloads into tanks.
- **Density** — today's density checks and the register.
- **Product stock** — packaged-item quantities; **Record Intake** for
  stock received outside a purchase.
- **Movements** — the audit trail; every movement, no exceptions.
- **Reconciliations** — **Stock Reconciliation** drawer: physically count,
  enter actual, and the system records expected vs actual variance with a
  reason.

## 11. Close the business day → DSR

When all of a date's shifts are closed: **Shifts** → **Business days** tab →
**Close day** → confirm "Close this business day?". This generates the
immutable **DSR** (Daily Station Sales Report) — a sales-only report of all
shift summaries plus the day's sales, credit sales, purchases and stock — and
seals the day. Office money (collections, expenses, income, supplier
payments) is in **Accounts → Daily cash book**, dated by entry date.

Days close independently: you can close Monday on Friday; an unclosed past
day never blocks today.

Done when: toast "Business day closed · DSR generated."

## 12. Reports

Sidebar → **Reports**, grouped in a list beside the report:

- **Sales**: **DSR** (generate/view snapshots) · **Attendant handovers** ·
  **Decantations**
- **Finance**: **Profit & loss** (Owner) · **Ledgers** (Party · Cash & bank) ·
  **Invoices**
- **Tax & registers**: **GST** (Sales · Purchases (ITC) · Income) ·
  **Expense register**

The Daily cash book is in **Accounts**; report print layouts are in
**Station → Report templates**.

## 13. The mobile app

The phone app is the owner's and manager's **control room** and the
attendant's **handover**. Sign in the same way (step 1). What you see depends
on your Role.

**Bottom dock.** Five tabs, shown only when your Role may open them:

| Tab      | What it holds                                                                                                                                                                                       | Who                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Home     | Today at a glance: sales, the live shift, tank levels, money position, **Needs attention**                                                                                                          | Owner, Manager             |
| Shifts   | The live shift and shift history; tap a shift for its **Shift Summary**                                                                                                                             | Owner, Manager             |
| Reports  | Business days (Live, Draft, Sealed, Report missing) with weekly figures; a Draft or Sealed day opens its **DSR** (Share, Download PDF), a Live day opens **Home**, and Report missing does not open | Owner, Manager, Accountant |
| Money    | **To collect** (customers) and **To pay** (suppliers); tap a Customer or Supplier for its balance, aging, **Statement**, **Record payment**, credit limit                                           | Owner, Manager, Accountant |
| Insights | Sales trend, product mix, shift performance; attendant variance, stock loss and credit health when the plan includes them                                                                           | Owner, Manager             |

A Manager has the same five tabs as the Owner. An Accountant gets Reports and
Money. Staff have no tabs unless they are assigned a dispenser unit on the open
shift; then they get a **Home** tab holding only their handover card (see
below), and an Accountant assigned to a pump gets that Home tab too.
Detail pages open on top of the tab and **‹ Back** returns to it.

**Header.**

- On **Home**, the station name and the **avatar** open the **Account sheet**;
  the **bell** (with a count) opens **Needs attention**. Other tabs show the
  tab title with the station name, which also opens the Account sheet.
- **Needs attention** is one list: stock alerts, a past business day still open,
  customers over their credit limit, a large shift cash variance, and your own
  unsaved handover. Tap an item to open the page that explains it. Home's
  "All N" opens the same list.
- The **Account sheet** holds who is signed in, the **station switcher**,
  **Team** (add or edit a member, reset a password, deactivate; a Manager can
  manage Staff and Attendants), the organization and plan, and **Sign out**.
  There is no Appearance setting yet: the app is always Light.

**Attendants** get a separate, handover-only app: no dock, no bell, no
station switcher. It shows your **handover** for the open shift (closing
readings, cash count, card/UPI slips, credit slips) and **Save handover**; after
saving it reads "Handover recorded" and stays editable until the shift closes.
The only other control is the **avatar**, which opens the **Account sheet** with
**Sign out**.

**Owners, managers, accountants and staff who man a pump.** When you are
assigned a dispenser unit on the open shift (step 6), a **Your handover** card
is pinned to the top of **Home**: **Continue** (or **Edit** once saved) opens
the same handover form as a page. An Owner or Manager keeps the full Home under
the card. An Accountant or Staff member has no Home overview, so their Home
holds just that card. The card goes when the shift closes.

Done when: the right tabs appear for the Role, the bell count matches the
**Needs attention** list, and each attendant sees only their handover.

---

## A full day at a glance

```text
06:00  Open Morning shift        (float, attendants, opening readings)
       …fuel flows, metered by nozzles…
09:30  Fuel tanker arrives     → Add Purchase (decant into tank)
11:00  Fleet truck fuels       → handover drawer → Log Credit Sale
12:00  Customer clears dues    → Log Collection
13:00  Tea & sundries paid     → Add Expense (Petty Cash)
14:00  Attendants hand over    → Record Handover (readings + cash count)
14:05  Close Morning shift     → Close shift page (4 steps) → Shift Summary
14:10  Open Evening shift      → Open next shift
  ⋮      (repeat per shift)
22:05  Close last shift
22:10  Close business day      → DSR generated
22:15  Settle to Bank / Transfer Money (bank the day's cash)
```
