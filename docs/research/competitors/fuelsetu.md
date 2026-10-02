# Competitor report: FuelSetu (fuelsetu.com)

← [Competitor landscape](./README.md)

Researched: 2 Oct 2026. Source: fuelsetu.com home page, rendered in a browser. The solution sub-pages were not read. Their figures are marketing claims and have not been verified. The site contradicts itself on customer count: "300+ pumps onboarded" in one place and "500+ pump owners" in another.

## 1. Company snapshot

| | |
|---|---|
| Vendor | Aariko Inc. (app id `com.aariko.fuelsetu`) |
| Claims | 300+ pumps onboarded, 19,100+ pincodes covered, 99.9% uptime, data hosted in India |
| Testimonials | Pune, Beed, Sangli: their base looks Maharashtra-led |
| Platforms | Mobile-first: Android + iOS apps, plus a small Windows app that connects to Tally |
| Go-to-market | Self-serve sign-up with a 7-day free trial (no card), or book a demo. Go-live in 5–6 days. Heavy SEO: pages per oil company (HP, BPCL, IOCL, Nayara) and 25+ guides and checklists |
| Support | Mon–Sat 9–7, replies within 4 hours, WhatsApp channel |

They are a young, modern SaaS competitor. That is closer to how PumpOS positions itself than Petrosoft is.

## 2. Their USPs ("What only FuelSetu has")

1. **Native Tally Connector.** A small Windows app that posts Sales, Receipt, Payment, Journal and Purchase vouchers into Tally Prime or ERP 9 automatically, with retries. For accountants who aren't online, it can also export Tally XML to send over WhatsApp. Included in every plan.
2. **Zoho Books certified sync.** Pushes credit invoices (GST + HSN), payments, cash discrepancies as journal vouchers, fuel deliveries as bills, tank dip variances, salary journals, and RCM/TCS/TDS registers. Duplicate-safe, with "drift detection".
3. **App in 5 languages:** English, Hindi, Marathi, Tamil, Telugu, with 4,086 strings fully translated and dates in local format.
4. **QR-based B2B credit.** A fleet driver scans a QR code to fuel on credit, and both the pump and the customer see the balance live. The self-service fleet portal has PDF statements, vehicles and drivers, aging (0–30 / 31–60 / 60+ days), and WhatsApp reminders.
5. **Automatic POS settlement matching.** API sync with Paytm, PhonePe and Razorpay, plus photo OCR of bank POS settlement slips (HDFC, ICICI, Axis), matched against each shift's card collection before the supervisor signs off.
6. **Trade discounts** for credit customers (%, flat ₹, or per litre), applied at QR scan and reflected in GST invoices.
7. **Bowser and tanker module:** gantry meter flow that counts each fill once, and per-delivery challan or invoice.
8. **Loyalty card:** QR points and a customer mini-app.
9. **Push alerts:** discrepancies, credit limits, low stock (below 1000 L), daily revenue.
10. **Other:** works offline (operator app), multi-outlet dashboard, trip sheet PDFs, tank calibration charts, thermal printer, Excel export, HMAC-signed requests (a request-signing security scheme), daily backups.

### The four role apps

| Role | Their scope |
|---|---|
| Station Owner (superadmin) | Multi-outlet dashboard, P&L, tax registers (GSTR-1, RCM, TDS), trip sheets, Tally/Zoho, users |
| Station Manager (supervisor) | Shifts, operator assignment, credit approval, POS matching, tank dips, bulk-drafting expenses, salaries and fuel purchases, alerts |
| Pump Attendant (operator) | Nozzle readings, B2B QR scan, digital handover sign-off, offline mode, 5 languages |
| Fleet / Corporate (B2B customer) | Self-service portal, PDF statements, QR fueling, vehicles and drivers, aging, WhatsApp reminders |

## 3. Their pricing

**One plan, every feature, priced per outlet. No feature gating.**

| Commitment | Price per outlet | Per year | Discount |
|---|---|---|---|
| 1 year | ₹18,000 | ₹18,000 | — |
| 2 years (most popular) | ₹28,800 | ₹14,400 | 20% |
| 3 years | ₹37,800 | ₹12,600 | 30% |

- Every plan includes unlimited dispensers, nozzles and staff accounts, the B2B portal with QR fueling, Tally, Zoho, POS matching, 5 languages, alerts and priority support.
- The customer brings their own Tally or Zoho licence.
- The site doesn't say whether prices include GST. Assume they don't.
- 7-day free trial. A refund policy page exists but was not read.

## 4. Feature comparison: FuelSetu vs PumpOS

Legend: ✅ have · 🟡 partial · ❌ missing · 🗺 on our roadmap

| Area | FuelSetu | PumpOS | Who leads |
|---|---|---|---|
| Nozzle readings, shifts, handover | ✓ digital sign-off | ✅ | Even |
| Shortage accountability | Discrepancy per shift | ✅ two levels: each attendant's drawer, then the office count at shift close | **PumpOS** |
| Shift Summary and daily sales report that can't be changed later | Trip sheets, 9-tab shift view | ✅ frozen Shift Summary and DSSR; several business days can be open and closed independently | **PumpOS** |
| Accounting depth (ledger, P&L, cost of goods, cash book) | Pushes to Tally or Zoho | ✅ full ledger built in | **PumpOS** (we don't need a separate accounting package) |
| Fuel VAT vs GST handling | GSTR-1, RCM, TCS/TDS registers | ✅ VAT/GST split · 🟡 no RCM/TDS/TCS registers | Even / FuelSetu on registers |
| Desktop app for the office | ❌ (mobile plus a Tally connector) | ✅ Tauri desktop + web | **PumpOS** |
| Multi-outlet | ✓ "All Outlets" view | ✅ multi-station · 🗺 consolidated reports | FuelSetu (consolidated view) |
| Audit trail | Audit logs, duplicate-safe sync | ✅ an event for every change; mistakes are voided, not edited | Even (we're deeper, they market it) |
| Tally | ✓ automatic posting + XML | 🗺 | **FuelSetu** |
| Zoho Books | ✓ | ❌ | **FuelSetu** |
| Multi-language | 5 languages | ❌ | **FuelSetu** |
| B2B fleet portal + QR credit fueling | ✓ | ❌ | **FuelSetu** |
| Credit limits, aging, WhatsApp reminders | ✓ | 🟡 limit stored, not enforced; no aging report or reminders | **FuelSetu** |
| Trade discounts (%, flat, per litre) | ✓ | ❌ | **FuelSetu** |
| POS settlement matching (API + OCR) | ✓ | 🟡 terminal entries per shift, matched by hand | **FuelSetu** |
| Tank dips, calibration charts, variance | ✓ | ✅ dips and variance · 🟡 calibration charts unconfirmed | Even |
| Density | Not advertised | ❌ | — |
| Push alerts | ✓ | 🗺 | **FuelSetu** |
| Offline | Operator app works offline | 🟡 duplicate-safe retries; no client-side write queue yet | FuelSetu |
| Bowser / tanker | ✓ | ❌ | FuelSetu (niche) |
| Loyalty | ✓ | ❌ | FuelSetu |
| Payroll | Salary journals only | ❌ | Even-ish |
| Excel export, thermal printer | ✓ | 🟡 PDF only | FuelSetu |
| Self-serve trial | 7 days | Unknown | FuelSetu |

**Summary.** FuelSetu is the more dangerous competitor. It is modern, mobile-first, and sells at a low flat price with no feature gating. It wins on integrations (Tally, Zoho, POS), languages, and the fleet-credit experience. PumpOS wins on accounting depth (we are the books, not just a feed into them), a proper desktop app for the office, and stricter reconciliation and audit.

## 5. What this changes for our roadmap

FuelSetu confirms what the Petrosoft review showed, and raises how urgent it is:

| Signal | Petrosoft | FuelSetu | Implication |
|---|---|---|---|
| Tally | ✓ export | ✓ automatic posting, in every plan | **P1, and must not be paid-only.** Start with XML export, then a connector |
| WhatsApp credit reminders | ✓ (Pro+) | ✓ | P1 |
| Credit limit enforcement + aging | ✓ | ✓ | P1 |
| Multi-language | Support only | 5 languages in the UI | **Moved up to P2**, starting with the attendant mobile app (Malayalam, Hindi, Tamil, Telugu) |
| POS settlement matching | Manual settlements | API + OCR | P2: start with importing a settlement CSV against our existing terminal entries |
| Fleet portal / QR credit | Customer app | Portal + QR | P2/P3: a read-only statement link first, QR later |
| Trade discounts for credit customers | ❌ | ✓ | P2: small to build in our credit sale flow |
| Push alerts | ✓ | ✓ | P2 |
| Density | ✓ | ❌ | Keep it as a differentiator against FuelSetu |

New ideas from FuelSetu:
- **Zoho Books:** Tally comes first. Zoho matters only for newer CA firms.
- **Bulk-drafting expenses:** a manager prepares entries in bulk for the office to approve.
- **SEO pages per oil company:** a cheap way to get found.
- **Self-serve trial:** lowers the friction of trying us.

## 6. Pricing implications (revises the Petrosoft report, §6)

> Superseded by the current recommendation in [README §2.4](./README.md#24-recommended-pumpos-pricing). Kept for the reasoning.

The market now has two price anchors:

| | Petrosoft | FuelSetu |
|---|---|---|
| Model | 4 tiers, gated | 1 plan, no gating, per outlet |
| Entry | ₹17,000 (Lite) | ₹18,000/yr |
| Full features | ₹32,000 (Max) | ₹18,000/yr (₹12,600/yr on a 3-year term) |

**Our proposed Pro at ₹20,000/yr is now above FuelSetu's all-inclusive price, so that number has to change.**

Revised suggestion:

| | **Basic** | **Pro** (anchor) | **Business** |
|---|---|---|---|
| Per station per year (excl. GST) | ₹9,999 | ₹15,999 | ₹24,999 for the first station, ₹12,999 for each extra |
| 2-year / 3-year | 15% / 25% off | 15% / 25% off | Custom |
| Positioning | Cheapest correct pump system on the market | Below FuelSetu, more accounting built in, plus a desktop app | Groups and high-volume pumps |

Rules to keep:
1. **Tally export and multi-language go in every plan.** FuelSetu has made them table stakes, so gating them would lose the comparison.
2. **What makes Basic customers upgrade to Pro:**
   - seats (attendant and manager apps)
   - automation: alerts, WhatsApp reminders, POS settlement matching
   - the fleet portal and trade discounts
3. **Business:** consolidated cross-station reports, interest on late payment, E-Invoicing, audit explorer, unlimited seats, dedicated support.
4. **Offer multi-year discounts.** FuelSetu uses them to lock customers in, so we have to match.
5. **Run a 14-day free trial** against their 7 days, with free data migration for pumps switching from Petrosoft or FuelSetu.

Open questions:
- Does FuelSetu's price include GST?
- Is there an onboarding fee? "Our team handles everything" may hide one.
- What does it cost to add an outlet on a multi-year plan?
- Which oil companies do their 300+ pumps belong to? Ask the dealers you speak to.

## 7. Comparison across competitors

Moved to the [competitor landscape](./README.md).
