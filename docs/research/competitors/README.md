# Competitor landscape: pricing and features

The single place to compare competitors side by side. Each competitor has its own deep-dive doc; the links in every table go straight to the relevant section.

| Competitor | Deep dive | Researched |
|---|---|---|
| Petrosoft (petrolbunksoftware.com) | [petrosoft.md](./petrosoft.md) | 2 Oct 2026 |
| FuelSetu (fuelsetu.com) | [fuelsetu.md](./fuelsetu.md) | 2 Oct 2026 |
| PetroByte (petrobyte.in) | [petrobyte.md](./petrobyte.md) | 2 Oct 2026 |
| PumpOne (pumpone.in) | [pumpone.md](./pumpone.md) | 2 Oct 2026 |

Competitor figures are their own marketing claims and have not been verified. PumpOS status reflects the repo as of the research date.

---

## 1. At a glance

| | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Vendor / base | Young Minds Technology Solutions, Tirupati, AP | Aariko Inc. (Maharashtra customers) | BeanByte Softwares, Jaipur, RJ | Infomuse Technologies, Noida, UP (IT agency) | — |
| Claimed reach | 10,000+ installs, 28 states, 10+ countries | 300–500 pumps | 5,000+ | Not published | — |
| Style | Older ERP, sold through demos | Mobile-first SaaS, integrations | Cloud accounting, low price | Windows + cloud; buy or subscribe | Ledger-first; desktop + web + mobile |
| Self-serve trial | ✗ | 7 days | 15 days | ✗ | Decide |
| Standout | 90+ reports, compliance | Tally/Zoho, 5 languages, QR fleet credit | Price, financial statements, payroll | Offline Windows version, density, sampling | Reconciliation, audit trail, tax correctness |
| Weakest at | UX, modern integrations | Accounting depth, no office desktop app | Accountability depth (not marketed) | No Tally, not their main business | Integrations, notifications, breadth |
| Details | [Snapshot](./petrosoft.md#1-company-snapshot) · [USPs](./petrosoft.md#2-their-usps) | [Snapshot](./fuelsetu.md#1-company-snapshot) · [USPs](./fuelsetu.md#2-their-usps-what-only-fuelsetu-has) · [Role apps](./fuelsetu.md#the-four-role-apps) | [Snapshot](./petrobyte.md#1-company-snapshot) · [USPs](./petrobyte.md#2-their-usps) | [Snapshot](./pumpone.md#1-company-snapshot) · [USPs](./pumpone.md#2-their-usps) | — |

---

## 2. Pricing comparison

### 2.1 Price per station

| Vendor | Model | Year 1 (₹) | Effective ₹/yr on a long term | Gating | Details |
|---|---|---|---|---|---|
| PetroByte | Subscription, every feature in every plan | 7,000 | 5,500 (3 yr) · 3,600 (10 yr) | None (Lite caps: 100 credit customers, 200 ledgers) | [Pricing](./petrobyte.md#3-their-pricing) |
| PumpOne (SaaS) | Monthly ₹899 / ₹1,099 / ₹1,299 | 10,788 – 15,588 | Same | Apps and users | [Pricing](./pumpone.md#3-their-pricing) |
| PumpOne (own) | One-time fee + annual renewal | 25,000 – 40,000 | 11,700 – 18,700 (3 yr) | Apps and users | [Pricing](./pumpone.md#3-their-pricing) |
| FuelSetu | Subscription, every feature, per outlet | 18,000 | 14,400 (2 yr) · 12,600 (3 yr) | None | [Pricing](./fuelsetu.md#3-their-pricing) |
| Petrosoft | 4 tiers | 17,000 – 48,000 | Not published | Features + seats | [Pricing](./petrosoft.md#3-their-pricing-from-the-rendered-pricing-table) · [Tier design](./petrosoft.md#how-their-tiers-are-designed) |

### 2.2 Tier detail

| Vendor | Entry tier | Middle tier | Top tier |
|---|---|---|---|
| Petrosoft | Lite ₹17k: core features, desktop only, 1 dealer app, 40 reports | Pro ₹22k: apps (2 manager, 10 attendant, 10 customer), notifications, payroll, 60 reports. **Max ₹32k** (marked most popular): unlimited apps, E-Invoice, interest on credit, loyalty, 90+ reports | Premium ₹48k: customised |
| FuelSetu | — | One plan ₹18k/yr: everything | — |
| PetroByte | Lite (<50 KL/month) ₹3k | Pro (<100 KL/month) ₹5k | Star (>100 KL/month) ₹7k. The price cards show ₹7k for every feature, so it's unclear which model is current |
| PumpOne | Standard: web, 1 user | Premium: + owner and attendant apps, 15 users | Pro: + customer app, unlimited users |

### 2.3 What the market tells us

1. **The price floor is ~₹600/month (PetroByte). The middle is ₹900–1,300/month (PumpOne, FuelSetu). The top is ₹2,700–4,000/month (Petrosoft).**
2. **Two ways to package:**
   - "One plan, everything included": FuelSetu, PetroByte.
   - "Gate on seats and apps": Petrosoft, PumpOne.
   - Nobody gates the core operations.
3. **Long commitments are discounted heavily:** 20–30% (FuelSetu), up to 50% (PetroByte's 10-year plan).
4. **Common extras:** no setup fee (PetroByte), referral credits (PetroByte), published price history (PetroByte), monthly billing (PumpOne).
5. **Unknowns to confirm on sales calls:**
   - Petrosoft's billing period and renewal price.
   - Whether FuelSetu's price includes GST.
   - PumpOne's multi-pump and Windows version pricing.
   - Which PetroByte pricing model is current.

### 2.4 Recommended PumpOS pricing

This supersedes the per-competitor recommendations in [Petrosoft §6](./petrosoft.md#6-pricing-and-packaging-recommendation-for-pumpos), [FuelSetu §6](./fuelsetu.md#6-pricing-implications-revises-the-petrosoft-report-6), [PetroByte §6](./petrobyte.md#6-pricing-implications-revises-the-fuelsetu-report-6) and [PumpOne §6](./pumpone.md#6-pricing-implications).

**Positioning:** the middle of the market. At or below FuelSetu and PumpOne, well below Petrosoft. Don't race PetroByte to the bottom; justify the price by money recovered: *"We find ₹X lakh a year in shortages and stock loss. The software costs about ₹1,000 a month."*

Plan names (decided): **Core / Pro / Scale**. Registry keys `CORE`, `PRO`, `SCALE`.
- **Core:** the full system, not a cut-down version.
- **Pro:** a pump run professionally, with staff and credit customers.
- **Scale:** groups growing to more outlets.

The order is obvious without a comparison table, and none of the names is a competitor's lowest or highest plan name.

| | **Core** | **Pro** (anchor) | **Scale** |
|---|---|---|---|
| Annual (per station, excl. GST) | ₹6,999 | ₹12,999 | ₹19,999 for the first station, ₹9,999 for each extra |
| Monthly | ₹699 | ₹1,299 | Annual only |
| 3-year term | 25% off | 25% off | Custom |
| Target | Price-sensitive single pump | Pump with attendants and credit customers | Groups, high-volume pumps |

**Every plan (never gated):**
- shifts, nozzle readings, attendant handover and drawer reconciliation
- Shift Summary and DSSR, day close
- stock, dips, variance, density
- purchases and suppliers
- credit customers with an enforced limit, invoices
- GST/VAT
- ledger, financial statements, Daily Cash Book
- Tally export, GSTR-1/3B, Excel/PDF export
- multi-language
- desktop and web

Credit statements and aging are also in every plan.

**Pro adds:**
- more seats (see the Limits in §4.2)
- automated WhatsApp and push alerts
- customer statement portal
- POS settlement and bank statement matching
- attendance, advances and shortage recovery, payroll

**Scale adds:**
- unlimited seats and users
- consolidated reports across stations
- interest on late payment, fleet tools
- E-Invoicing / E-Way Bill
- audit explorer
- dedicated support

The full gating decision for each feature is in [§4.2](#42-gating-and-plan-placement).

**Growth levers:**
- 14–15 day trial, no setup fee
- free data migration from any competitor
- referral credit (1 month free)
- guaranteed data export even after a plan lapses
- published yearly price increases, to reward early commitment

**Alternative to test:** pricing by monthly volume (same features, price by KL per month), as in PetroByte's table. It's fair to small rural pumps and easy to explain.

**Mapping to code:** see [§4.3](#43-gating-rules).

---

## 3. Feature comparison

Legend: ✓ competitor has · ✅ PumpOS has · 🟡 partial · ❌ missing · 🗺 on our roadmap · — not advertised

Each competitor's own full matrix: [Petrosoft §4](./petrosoft.md#4-feature-comparison-petrosoft-vs-pumpos) · [FuelSetu §4](./fuelsetu.md#4-feature-comparison-fuelsetu-vs-pumpos) · [PetroByte §4](./petrobyte.md#4-feature-comparison-petrobyte-vs-pumpos) · [PumpOne §4](./pumpone.md#4-feature-comparison-pumpone-vs-pumpos)

### 3.1 Forecourt operations

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Nozzle readings, multiple shifts | ✓ | ✓ | ✓ | ✓ | ✅ |
| Attendant nozzle/DU assignment + opening cash | ✓ | ✓ | ✓ | ✓ | ✅ |
| Attendant shortage tracking | ✓ | ✓ | — | ✓ | ✅ two levels: attendant drawer, then office count |
| Shift and day reports that can't be altered | — | — | — | — | ✅ frozen Shift Summary and DSSR |
| Audit trail (every change recorded, voids not edits) | — | Audit logs (sync) | — | — | ✅ |
| Daily price changes | ✓ | ✓ | ✓ | ✓ | ✅ |
| Lubricant sales, assigned per shift | ✓ | ✓ | ✓ | ✓ | ✅ |
| Card / UPI / petro card | ✓ | ✓ | ✓ | ✓ | ✅ |
| POS settlement matching | Manual | ✓ API + OCR | Ledger per terminal | — | 🟡 manual |
| Counter / cash bill | ✓ | — | ✓ | ✓ | ❌ |
| Thermal printing | ✓ | ✓ | — | — | 🟡 browser print / PDF |
| Offline | — | ✓ attendant app | — | ✓ Windows version | 🟡 desktop shell; no queue for offline writes yet |

### 3.2 Stock and quality

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Tank dips, stock variance | ✓ | ✓ | ✓ | ✓ | ✅ |
| Density readings | ✓ | — | — | ✓ | ❌ |
| Decantation (ordered vs received) | ✓ | — | ✓ | — | ❌ |
| Fuel sampling, evaporation | — | — | ✓ evaporation | ✓ | ❌ |
| Tank calibration charts | — | ✓ | — | — | 🟡 |
| Sales Officer inspection | ✓ (Max+) | — | — | — | ❌ |
| Tanker / bowser / lorry | ✓ (Max+) | ✓ | ✓ | ✓ tanker trips | ❌ |

### 3.3 Credit customers

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Credit sales, customer ledger | ✓ | ✓ | ✓ | ✓ | ✅ |
| Credit limit that blocks a sale | ✓ | ✓ | — | — | 🟡 alert only |
| Statements / periodic billing | ✓ | ✓ PDF | ✓ | ✓ | 🟡 invoices only |
| Vehicle-wise / indent | ✓ | ✓ vehicles + drivers | ✓ online indent | ✓ | ❌ |
| Aging (0–30 / 31–60 / 60+) | — | ✓ | — | — | ❌ |
| Interest on late payment | ✓ (Max+) | — | — | — | ❌ |
| Trade discounts | — | ✓ | — | — | ❌ |
| Customer app / portal | ✓ (Pro+) | ✓ portal + QR | ✓ | ✓ (Pro) | ❌ |
| Short-term credit | — | — | ✓ | ✓ | ❌ |

### 3.4 Accounting and compliance

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Ledger, expenses, income | ✓ | Via Tally/Zoho | ✓ | ✓ | ✅ |
| P&L | ✓ | ✓ | ✓ | ✓ | ✅ |
| Balance Sheet, Trial Balance | — | — | ✓ | — | ❌ |
| Bank reconciliation | ✓ | — | — | ✓ | 🟡 a flag only |
| Supplier payables | ✓ | ✓ | ✓ | ✓ | ✅ |
| Correct fuel VAT vs GST | Reports | Registers | Reports | Reports | ✅ VAT/GST split, tax taken out of inclusive prices |
| GSTR-1 / 3B | ✓ | ✓ | ✓ | ✓ VAT/GST reports | 🟡 tax register · 🗺 |
| TCS / TDS / RCM | ✓ TCS | ✓ | — | — | ❌ |
| E-Invoice / E-Way Bill | ✓ (Max+) | — | — | — | ❌ |
| Tally export | ✓ | ✓ automatic posting | ✓ | — | 🗺 |
| Zoho Books | — | ✓ | — | — | ❌ |
| Cheque printing | — | — | — | ✓ | ❌ |

### 3.5 Staff

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Attendance | ✓ | — | ✓ | ✓ | 🗺 |
| Payroll / payslip | ✓ (Pro+) | Salary journals | ✓ automatic | ✓ | ❌ |
| Advances / loans | ✓ hand loans (Max+) | — | — | — | ❌ |

### 3.6 Apps, notifications, platform

| Feature | Petrosoft | FuelSetu | PetroByte | PumpOne | PumpOS |
|---|---|---|---|---|---|
| Attendant app | ✓ (Pro+) | ✓ | ✓ | ✓ (Premium+) | ✅ |
| Owner app | ✓ | ✓ | ✓ | ✓ live | 🟡 read-only first version |
| Manager app | ✓ (Pro+) | ✓ | ✓ | — | 🟡 |
| Desktop app | — | ✗ | ✗ web | ✓ Windows | ✅ Tauri |
| SMS / WhatsApp / email | ✓ (Pro+) | ✓ WhatsApp + push | ✓ | ✓ SMS/email | 🗺 |
| Push alerts | — | ✓ | — | ✓ | 🗺 |
| Multi-language UI | Support only | ✓ 5 languages | — | Claimed | ❌ |
| Multi-station dashboard | — | ✓ | Per licence | ✓ | ✅ multi-station · 🗺 consolidated reports |
| Reports | 40 / 60 / 90+ | Trip sheets, analytics | 40+, 8+ dashboards | Not stated | ~10 report tabs |
| Excel / CSV export | Backup | ✓ | ✓ | — | 🟡 PDF only |
| Loyalty | ✓ (Max+) | ✓ | ✓ | — | ❌ |
| Data export guarantee | Hard-disk backup | — | ✓ "no lock-in" | — | Decide |

---

## 4. Implementation priorities and gating

Per-competitor reasoning: [Petrosoft §5](./petrosoft.md#5-gaps-to-close-by-switching-impact) · [FuelSetu §5](./fuelsetu.md#5-what-this-changes-for-our-roadmap) · [PetroByte §5](./petrobyte.md#5-roadmap-implications) · [PumpOne §5](./pumpone.md#5-roadmap-implications)

### 4.1 Ranked order

Each item is ranked by three things: how many competitors have it, its deal impact (*blocks a sale*: the dealer or their CA rejects us without it; *causes churn*; *nice to have*), and effort given what PumpOS already has.

| Rank | Tier | Item | Competitors | PumpOS now | Deal impact | Effort |
|---|---|---|---|---|---|---|
| 1 | T1 | Tally export (vouchers XML) | 3/4 | 🗺 | Blocks a sale (the CA's veto) | Low–med |
| 2 | T1 | GSTR-1 / 3B export | 4/4 | 🟡 tax register | Blocks a sale | Low–med |
| 3 | T1 | Excel / CSV export on every report | 3/4 | 🟡 PDF only | Blocks a sale | Low |
| 4 | T1 | Credit completeness: enforce the limit (audited override), statement PDF, aging | 4/4 | 🟡 | Blocks a sale | Medium |
| 5 | T1 | WhatsApp sharing + automated reminders and summaries | 4/4 | 🗺 | Blocks a sale | Medium |
| 6 | T2 | Balance Sheet + Trial Balance | 1/4 | ❌ | Completeness | Low |
| 7 | T2 | Density + decantation | 3/4 | ❌ | Compliance | Medium |
| 8 | T2 | Customer statement link / portal | 4/4 | ❌ | Causes churn | Medium |
| 9 | T2 | Owner app alerts + daily push | 3/4 | 🟡 read-only | Causes churn | Medium |
| 10 | T2 | Multi-language (attendant app first) | 1/4 (FuelSetu) | ❌ | Differentiates us | Medium |
| 11 | T2 | Attendance → advances and shortage recovery | 3/4 | ❌ | Causes churn | Low–med |
| 12 | T3 | POS settlement matching (CSV import first) | 2/4 | 🟡 | Nice to have | Medium |
| 13 | T3 | Bank reconciliation (statement import) | 2/4 | 🟡 flag | Nice to have | Medium |
| 14 | T3 | Payroll / payslips | 3/4 | ❌ | Nice to have | Medium |
| 15 | T3 | More reports (stock register, sales register, attendant monthly, rate change) | All | ~10 tabs | Ongoing | Ongoing |
| 16 | T3 | Expiry / renewal reminders | 1/4 | ❌ | Nice to have | Low |
| 17 | T3 | Thermal printing, counter bill | 3/4 | 🟡 | Nice to have | Hardware dependent |
| — | T4 | Interest on credit, fleet (trade discounts, vehicles, indent), E-Invoice, tanker/bowser, loyalty, Zoho, cheque printing, Sales Officer inspection | 1–4/4 | ❌ | Build when a customer asks | Varies |
| — | Ongoing | Offline writes: finish the Level 2 client-side write queue | 2/4 market offline | 🟡 | Protects the desktop pitch | Medium |

### 4.2 Gating and plan placement

Proposed. Moving a capability between plans is a one-line registry change.

| Item | Gate | Key / Limit | Core | Pro | Scale | Why |
|---|---|---|---|---|---|---|
| Tally export | Capability, **in every plan** (decided) | `exports.tally` | ✓ | ✓ | ✓ | Table stakes; the key allows a per-organisation switch-off |
| GSTR-1 / 3B export | Ungated | — | ✓ | ✓ | ✓ | Monthly compliance |
| Excel / CSV export | Ungated | — | ✓ | ✓ | ✓ | Refusing it reads as lock-in |
| Credit limit enforcement, statements, aging | Ungated | — | ✓ | ✓ | ✓ | Completes an existing feature |
| Manual WhatsApp share (from the phone) | Ungated | — | ✓ | ✓ | ✓ | Costs us nothing |
| Automated WhatsApp / SMS / email | Capability | `notifications.whatsapp` | ✗ | ✓ | ✓ | Costs us per message |
| Balance Sheet + Trial Balance | Ungated | — | ✓ | ✓ | ✓ | Derived from our own ledger |
| Density + decantation | Ungated | — | ✓ | ✓ | ✓ | Oil-company compliance |
| Customer statement portal | Capability | `crm.customer_portal` | ✗ | ✓ | ✓ | Separable; competitors gate it |
| Owner app (read) | Ungated | — | ✓ | ✓ | ✓ | Already shipped |
| Owner alerts + daily push | Capability | `notifications.push_alerts` | ✗ | ✓ | ✓ | Automation |
| Multi-language | Ungated | — | ✓ | ✓ | ✓ | Attendant usability |
| Attendance | Capability | `staff.attendance` | ✗ | ✓ | ✓ | Separable module |
| Advances / shortage recovery | Capability | `staff.advances` | ✗ | ✓ | ✓ | Goes with attendance |
| Payroll / payslips | Capability | `staff.payroll` | ✗ | ✓ | ✓ | Competitors gate it |
| POS settlement matching (import) | Capability | `finance.pos_matching` | ✗ | ✓ | ✓ | Automation; manual entry stays free |
| Bank statement reconciliation | Capability | `finance.bank_reconciliation` | ✗ | ✓ | ✓ | Automation; the manual flag stays free |
| Core registers and reports | Ungated | — | ✓ | ✓ | ✓ | Everyday work |
| Advanced analytics | Capability | `reports.advanced` | ✗ | ✗ | ✓ | Premium |
| Consolidated reports across stations | Capability | `reports.cross_station` | ✗ | ✗ | ✓ | Only useful to multi-station groups |
| Expiry reminders (in-app) | Ungated | — | ✓ | ✓ | ✓ | Push or WhatsApp delivery uses `notifications.*` |
| Thermal printing, counter bill | Ungated | — | ✓ | ✓ | ✓ | Forecourt work |
| Interest on late payment | Capability | `crm.credit_interest` | ✗ | ✗ | ✓ | Petrosoft Max+ |
| Fleet: trade discounts, vehicles, indent | Capability | `crm.fleet` | ✗ | ✗ | ✓ | Larger pumps |
| E-Invoice / E-Way Bill | Capability | `compliance.einvoice` | ✗ | ✗ | ✓ | Integration cost |
| Audit explorer UI (events always recorded) | Capability | `audit.explorer` | ✗ | ✗ | ✓ | Only the browsing UI is gated |
| Tanker/bowser, loyalty, Zoho | Capability each | `ops.bowser`, `crm.loyalty`, `exports.zoho` | ✗ | ✗ | ✓ or add-on | Niche |
| **Stations** | Limit (exists) | `station_count` | 1 | 1 | 1 + paid extras | Already built |
| **Users per organisation** (all roles) | Limit (new) | `user_count` | 5 | 25 | Unlimited | Decided: an overall user cap for each organisation |
| **Attendant seats** | Limit (new) | `attendant_seats` | 3 | 15 | Unlimited | Decided: attendant seats are limited separately. Counted inside `user_count` |

Seat numbers are proposals to validate. A typical small pump runs 2 shifts × 2 attendants.

### 4.3 Gating rules

1. **Never gate:**
   - the operational core
   - completions that make an existing feature correct
   - basic compliance (GST, Tally, Excel)
   - anything on the path to closing a business day
2. **Register a capability only once its feature ships.** For each feature:
   - add it to `PRODUCT_ACCESS_REGISTRY` (`packages/core/src/capabilities/organization-access/registry.ts`)
   - guard the API route with `requireCapabilityGuard`
   - wrap the UI in `CapabilityGate` / `CapabilityRoute`
   - declare a write policy for each new mutating route
   - follow the `pump-access-gating` skill
3. **Plans are `CORE`, `PRO` and `SCALE`, with `CORE` as the default.** There are no live customers yet, so `CORE` is redefined to the gated entry plan. The two existing pilot pumps are moved to their plan by hand when the plans ship. Once real customers exist, removing a capability from a plan they're on needs a migration plan.
4. **Seat Limits block growth, not current users.** As with `station_count`: if a Limit is lowered, existing users keep working and only new invitations are refused.

**Our moat. Keep investing; no competitor markets these:**
- attendant drawer and office reconciliation at two levels
- Shift Summary and DSSR frozen once generated
- every change recorded as an event, mistakes voided rather than edited
- correct handling of fuel VAT vs GST
- multi-tenant data isolation

---

## 5. Adding a competitor

1. Copy one of the deep-dive docs and keep its section headings, so the anchor links here keep working.
2. Render the pricing page in a browser; Petrosoft and PumpOne build their tables in JavaScript.
3. Add a column to every table in this doc, and a row to §2.1 and the index at the top.
4. Revisit §2.4 and §4 if the new competitor shifts the market.
