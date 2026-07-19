# Phase MB — Mobile owner app (owner-first PWA)

**Status:** Planned. **Goal:** turn the current read-only mobile MVP into the
owner's primary daily surface — a fast, glanceable cockpit for **reports, live
shift status, money health, and exceptions**, navigable across **any business
day**, with report downloads and alerts. Owners will rarely open the desktop
console; the phone is where they check the station's pulse. A second track adds
a **mobile-only attendant experience** so pump attendants self-record their
handover during the shift.

> Scope notes (per user):
> - **Single-station first.** We have no multi-station owners/customers yet, so
>   the owner app targets the **active station**. Multi-station rollup is kept as
>   a clearly-marked **`TODO(multi-station)`** in code and revisited later — see
>   "MB1-future". Design every screen station-scoped so the rollup layers on top
>   without a rewrite.
> - **Any business day.** Owners must be able to move to **any business day**
>   (not just today) and see every screen re-scoped to it — a global date pill.
> - **No approval workflows** in this phase (there are none in the domain yet).
>   Owner focus is **visibility + reports + org/team awareness**, not operational
>   writes.
> - **Attendant login is mobile-only.** We are not exposing the full SPA to
>   attendants; their whole world is a small mobile handover flow.
> - Mobile stays **online-only** (per `AGENTS.md`: mobile does not support
>   offline). Owner-first; Manager/Accountant get trimmed subsets of the same
>   screens; Attendant gets its own minimal surface.

Depends on / complements:
- **Phase M** — the `m.pumpos.app` host + shared `.pumpos.app` cookie session.
- **Phase R (R4)** — server PDF endpoints make report download reliable on phones.
- **Phase F** — real COGS/P&L; until then "margin" is revenue-minus-costs proxy only.
- **Phase L** — ledger/money visibility shapes the receivables/payables screens.

Nothing here changes the domain model, API contracts, or schema beyond a few
**additive read/aggregation endpoints** and **alert/notification** plumbing.

---

## What exists today (MVP baseline)

Four read-only tabs, single station, single day:
- **Home** — today's KPIs (fuel sales, collections, expenses, purchases,
  receivables, payables, cash variance) via `useShiftSummaries`, `useCollections`,
  `useExpenses`, `usePurchases`, `useCustomers`, `useSuppliers`, `useShiftStatus`.
- **Shifts** — live shift (opener, opening cash, nozzle count, elapsed) + recent
  closed shifts via `useShiftStatus`, `useShiftSummaries`.
- **DSSR** — daily report preview with collections breakdown via `useDailyDssrPreview`.
- **Ledger** — customer/supplier balances + recent entries via `useCustomers`,
  `useSuppliers`, `useCustomerLedger`, `useSupplierLedger`.

Role gating already exists (`TABS_BY_ROLE`); `Staff` is locked out.

### Reusable data already available (no new API needed)
| Capability | Existing hooks / endpoints |
|---|---|
| Stations / org / users | `useStations`, `useOrganization`, `useUsers` (`GET /users`) |
| Live shift + who's on it | `useShiftStatus` (opener, template, readings), `GET /shifts/handovers` (attendants) |
| Shift history | `useShiftSummaries`, `GET /shift-summaries` |
| Sales / money | `useSales`, `useCollections`, `useExpenses`, `usePurchases`, `useCreditSales`, `useMoneyMovements` |
| Ledgers | `useCustomers`, `useSuppliers`, `useCustomerLedger`, `useSupplierLedger` |
| Inventory / tanks | `useInventoryStatus`, `useTanks`, `useInventoryItems`, `useInventoryVariances` |
| DSSR (single + range) | `useDailyDssr`, `useDailyDssrPreview`, **`useDailyDssrRange`** (trends!) |
| Alerts (stock) | `useStationAlerts` (tanks low/critical, oversold) |
| Finance accounts | `useFinancialAccounts`, `useFinanceMovements`, `useAccountLedger` |
| Pricing | `usePricing`, `GET /pricing/history` |

### Gaps that need new work
- **Global business-day navigation** — the app defaults to today; screens need a
  shared date pill that re-scopes every tab to any past business day
  (`useDailyDssr` for snapshots, `useShiftSummaries`/`useSales` filtered by date).
- **True margin / P&L** — needs Phase F (COGS). Show a labelled proxy until then.
- **Report download on phone** — client react-pdf works, but R4 server PDF is the
  robust path; add a share/download affordance.
- **Alerts beyond stock** — variance, credit-limit breach, day-not-closed,
  receivable aging; plus a delivery channel (in-app feed → web push).
- **Attendant self-service handover** — a mobile-only attendant role + flow, plus
  an authorization tightening so an attendant may only write **their own**
  handover (see MB8).
- **Multi-station rollup** — `TODO(multi-station)`, deferred. Aggregate
  today/period across all stations (client fan-out, later a `GET /rollup`
  endpoint). Keep screens station-scoped so this layers on cleanly (MB1-future).

---

## Target information architecture

Two distinct app shells decided by role at login:

**Owner / Manager / Accountant — five tabs**, each glanceable and drill-downable:

```
[ Overview ]  [ Shifts ]  [ Reports ]  [ Money ]  [ More ]
```

- **Overview** — station cockpit (was "Home"). Selected day's KPIs + exceptions.
- **Shifts** — live status: who's assigned, what's open/closed, variance watch, attendants.
- **Reports** — DSSR + Shift Summary browser with **date picker + download/share**.
- **Money** — collections mix, receivables/payables health, expenses, purchases, cash position.
- **More** — trends & analytics, inventory/tanks, team/org, alerts, profile/sign-out.

Manager sees `Shifts / Reports / Money`; Accountant sees `Reports / Money`.

**Attendant — single-purpose shell** (MB8): the active shift's handover form for
their assigned dispenser unit(s) + a short history of their own past handovers.
No reports, no financials, no other stations.

**Global controls in the top bar** (owner shell):
- A **business-day pill** (`◀ 18 Jul ▶` + calendar) that re-scopes every tab to
  the chosen day; defaults to the current business day.
- A **station selector** — single station today. `TODO(multi-station)`: extend to
  an *All stations ↔ station* switch once multiple stations exist. Keep every
  screen station-scoped so the switch is additive.

---

## Milestones

### MB1 — Station Overview cockpit (any business day)
The owner's landing screen: one glance answers "how is this station doing on the
selected day, and is anything wrong." Scoped to the **active station** and the
**globally-selected business day** (defaults to today).

- **KPI strip:** selected day's fuel sales, volume, collections (by mode),
  expenses, purchases, credit, net cash movement, cash variance, open-shift count.
- **Live-vs-history:** when the selected day is today, show live shift status;
  for past days show the closed-day summary from the DSSR snapshot.
- **Exceptions row:** top attention items for the station (from an extended
  `useStationAlerts` — see MB6).
- **Day-close status:** flag if the selected/prior business day is still open past
  the cutoff (owners care that days get closed).
- Data: `useShiftStatus` (lite), `useShiftSummaries`, `useDailyDssr` /
  `useDailyDssrPreview` — all filtered by the selected business day.

> **MB1-future — Multi-station rollup (`TODO(multi-station)`).** When multiple
> stations exist, add an org strip (all-station totals for the selected day) and
> per-station cards (sales, volume, shift badge, variance chip, exception dot;
> tap → scope to that station). Implement first as a client fan-out over
> `useStations`; collapse into a single `GET /rollup?date=` endpoint (operational
> tier, 15s) once latency warrants. Leave a `TODO(multi-station)` marker at the
> station selector and Overview so this is easy to find.

### MB2 — Shifts & staff accountability
"Who is running my station and are the drawers honest?"

- **Live board:** per open shift — template, **assigned operator(s)/attendants**
  (`GET /shifts/handovers`), opening cash, nozzles in use, elapsed time, live
  estimated sales if available. With MB8, shows which attendants have **already
  self-recorded** their handover vs. still pending.
- **Recent shifts:** closed shifts with cash-variance chip (green/amber/red by
  threshold); tap → shift summary drill-down (nozzle reconciliation, drawer recon).
- **Variance watch:** highlight shifts breaching the variance threshold; per-operator
  variance tally over a rolling window (accountability signal).
- **Day-close nudge:** flag when the selected station's business day is open past the cutoff.
- Reuses `useShiftStatus`, `useShiftSummaries`; adds an attendants join in the UI.

### MB3 — Reports browser + download/share
Owners want to **read and forward** reports, not generate them.

- **DSSR viewer:** the global **business-day pill** drives the date; live preview
  for today, immutable snapshot for past days (`useDailyDssrPreview` /
  `useDailyDssr`). Sectioned like desktop (KPIs, financial summary,
  fuel-by-product, nozzle aggregation, stock variance).
- **Shift Summary viewer:** open any closed shift's immutable summary.
- **Download / Share:** generate PDF and hand to the OS share sheet
  (`exportPdf` already abstracts saver; on mobile use the Web Share API / Tauri).
  Prefer **R4 server PDF** endpoints (`/reports/dssr/:id.pdf`,
  `/reports/shift/:id.pdf`) so phones don't render heavy react-pdf. Honors the
  station's `report_config` sections + paper size (Phase R2).
- **Range export (later):** month-to-date DSSR bundle via `useDailyDssrRange`.

### MB4 — Money health
Consolidates the owner's financial pulse (extends today's Ledger tab).

- **Collections mix:** cash / card / UPI / bank split for the day and period
  (`useCollections`, DSSR `collections` block) — pie/bar sparkline.
- **Receivables:** total customer dues, **top debtors**, credit-limit breaches,
  simple aging buckets (0–30 / 31–60 / 60+). `useCustomers`, `useCustomerLedger`.
- **Payables:** supplier dues, upcoming/overdue, recent purchases & supplier
  payments. `useSuppliers`, `useSupplierLedger`, `usePurchases`.
- **Cash position:** drawer variance trend + (with Phase F) money-account
  balances via `useFinancialAccounts`.
- Ledger drill-down retained from MVP; add search + sort by exposure.

### MB5 — Trends & analytics ("More")
Turns raw daily data into direction.

- **Sales & volume trend:** last 7/30 days for the station, day-over-day and
  month-to-date, built on `useDailyDssrRange`. `TODO(multi-station)`: org-wide
  fan-out when multiple stations exist.
- **Product mix:** volume/value share by fuel product over the period.
- **Expense ratio & net:** expenses as % of sales; net cash movement trend.
- **Margin proxy → real margin:** show revenue − (purchases + expenses) as a
  clearly-labelled *proxy* now; swap to true COGS/P&L once **Phase F** lands.
- **Inventory & tank levels:** per-tank % full, **days-of-cover** (volume ÷ avg
  daily sales), low-fuel flags (`useInventoryStatus`, `useTanks`), merchandise
  variance summary (`useInventoryVariances`).
- Lightweight charts only (sparklines/bars) — keep the bundle small.

### MB6 — Alerts & notifications
Owner gets pinged for exceptions instead of hunting for them.

- **Unified alert model:** extend `useStationAlerts` beyond stock to cover:
  - drawer **variance breach** (per shift over threshold),
  - **business day not closed** past cutoff,
  - **credit-limit breach** / customer over limit,
  - **receivable aging** (dues older than N days),
  - **tank critically low / days-of-cover < N**,
  - (later) sync/connectivity for desktop parity.
- **In-app alert feed** ("More" → Alerts): grouped by station, severity-sorted,
  each with a deep-link into the relevant tab.
- **Push delivery:** PWA **Web Push** (service worker already present at
  `apps/mobile/public/sw.js`) for owners; opt-in, per-severity. Server side: a
  small notifications table + a scheduled evaluator (Worker cron) that emits from
  the same alert rules. Ship in-app feed first, push second.

### MB7 — Team & organization awareness
Org-level visibility the owner asked for (read-first).

- **Team roster:** list users with role, assigned station(s), active/inactive
  (`useUsers` / `GET /users`). Read-only view of who can do what.
- **Org profile:** legal name, GSTIN, stations, branding (`useOrganization`).
- **Optional light writes (guarded, later):** invite/deactivate a user or change
  a role — only if we decide mobile should manage team; keep behind a flag and
  Owner-only. No other operational writes in this phase.

### MB8 — Attendant login & self-service handover (mobile-only)
Let pump attendants **record their own handover during the shift** so that at
close time only the physical **cash** needs to change hands — everything else
(closing readings, digital collections, credit slips, testing, and **merchandise
closing**) is already saved. This is a **mobile-only** capability; attendants
never touch the SPA.

**Domain / roles (decided)**
- Introduce a **first-class `Attendant`** role (`Owner | Manager | Accountant |
  Staff | Attendant`). It is the most restricted role: mobile-only, sees only the
  active shift it is assigned to at its own station, and can write only **its
  own** handover. Requires updating `Role` (`packages/shared`), the user role
  enum (create/update schemas), and `guards.ts`.
- **Offline staff vs. platform user, keyed by email.** A user's `email` is
  already optional and `authUserId` is nullable. Rule:
  - **email present** → the user can log into the platform (an auth account is
    provisioned / linkable). An `Attendant` with an email logs into the mobile
    app to self-record.
  - **no email** → **offline staff**: exists only as a name on shift assignments
    and handovers; cannot log in. Someone else records their handover.
  So "enabling" a staff member = adding their email. No separate flag needed.

**Assignment (decided) — drives what the attendant sees**
- Staff/attendants are **assigned when the shift starts**. This already exists:
  `OpenShift` accepts `staffAssignments: [{ userId, duId }]` and writes
  `shift_staff_assignments`; `shift_terminal_links` maps terminals (optionally to
  a DU). The attendant's phone reads **its** assignment to show exactly the right
  **dispenser unit(s), nozzles, and terminals** — no manual picking.

**Attendant flow (mobile)**
1. Log in → lands directly on "My shift" (the open shift + DU they're assigned to).
2. Enter/adjust **closing nozzle readings** for their nozzles (volume derives).
3. Enter **card/UPI per terminal** (with batch refs), **credit** slips, and
   **testing** volume as the shift progresses.
4. Enter **merchandise closing** for the shift (lubes/coolant/accessories) — the
   same per-attendant merchandise handover we record today
   (`POST /shifts/:id/merchandise-handover`).
5. **Save** — the existing `POST /shifts/handovers` upserts by `(shift, user, du)`,
   so repeated saves just replace the draft. No new fuel-handover write path.
6. At close, the attendant confirms **cash handed over**; Staff/Manager on the
   desktop see the pre-filled handover and only reconcile physical cash.

**Backend to build**
- Add `Attendant` role + guards; make the role selectable in user create/update.
- **Read endpoint** `GET /shifts/my-assignment` (or extend `/shifts/status`):
  returns the caller's active shift, assigned DU(s), those DUs' nozzles + opening
  readings, and linked terminals — the exact inputs the handover form needs.
- **Secure the write:** in `POST /shifts/handovers` (and the merchandise handover),
  when the caller is an `Attendant`, force `userId = self`, verify the shift is
  one they're assigned to, and reject other users'/stations' data. Locked shift
  already returns 409 — keep it.

**Trust:** attendant self-report is a **convenience, not the source of truth for
cash** — the manager still reconciles physical cash at close, so variance
accountability is preserved.

**Non-attendant roles who man a pump.** Assignment is role-agnostic (any user can
be assigned to a DU at shift open). The self-service handover UI is a single
shared `HandoverPanel`:
- **Attendant** role → a dedicated full-screen shell (no owner tabs).
- **Any other role** (Owner/Manager/Accountant/Staff) who is assigned to a DU on
  an open shift → an extra **"My handover"** tab appears alongside their normal
  tabs, rendering the same panel. A `Staff` member with no other mobile tabs but
  an active assignment therefore gets just that one tab. The tab is driven by
  `GET /shifts/my-assignment` returning a non-null assignment for the caller.

**Connectivity:** mobile is **online-only** (confirmed) — attendants are expected
to have mobile data. No offline/queued handover in scope.

---

## Cross-cutting concerns

- **Caching (Phase P tiers):** rollup/shift/DSSR = *operational* (15s, not
  persisted); stations/users/org = *static* (persisted). Never bypass the query
  hooks; mutations (if any land) call `useInvalidateOperational`.
- **Station scope:** single active station today; a top-bar **business-day pill**
  drives every tab's date. `TODO(multi-station)`: add an *All ↔ station* switch
  and persist the last choice per session once multiple stations exist.
- **Performance:** the single-station path is a handful of reads. For the future
  rollup, cap client fan-out concurrency and introduce `GET /rollup` when N
  stations makes latency bite. Charts stay dependency-light.
- **Role gating:** extend `TABS_BY_ROLE` — Owner full; Manager `Shifts/Reports/
  Money`; Accountant `Reports/Money`; **Attendant** → the MB8 handover shell only;
  Staff still none.
- **Design system:** compact, light-first, information-dense per
  `pump-erp-design-system`; reuse `Kpi`, tokens, and the existing shell.
- **PWA/offline:** read screens may cache last-good responses for a graceful
  offline *view* (not writes); mobile remains online-authoritative.

---

## Suggested sequence

MB1 (Overview, any business day) + business-day pill → MB2 (Shifts/staff) →
MB3 (Reports + download) → MB4 (Money) → MB5 (Trends/inventory) → MB6 (Alerts) →
MB7 (Team/org). **MB8 (Attendant)** is an independent track and can run in
parallel once the `Attendant` role + handover authorization are agreed.
Multi-station rollup (MB1-future) is deferred until real multi-station customers
exist.

MB1–MB4 are pure reads on existing hooks and deliver most of the owner value.
MB3's best experience wants **R4**; MB5's true margin wants **Phase F**; MB6's
push wants the notifications table + cron. Everything ships incrementally on the
current `apps/mobile` shell.

---

## Open questions
- **Business-day default & range:** default to today and let owners page back
  arbitrarily far, or cap history (e.g. last 90 days) for performance?
- Web Push for owners in this phase, or defer push and ship the in-app feed only?
- Variance / aging / days-of-cover thresholds: station-configurable now, or ship
  sensible defaults (per `useStationAlerts` TODO) and make them settings later?
- Multi-station rollup: revisit trigger — is it purely "a customer has 2+
  stations", or do we build it speculatively behind a flag?

## Decided
- **Attendant** is a first-class role; email present ⇒ can log in, no email ⇒
  offline staff (no login). Shift assignment (at open) drives the DU/nozzles/
  terminals the attendant sees. Merchandise closing is part of the attendant
  handover. Mobile is online-only.
- Single-station first; multi-station rollup deferred (`TODO(multi-station)`).
