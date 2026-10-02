# Competitor report: PumpOne (pumpone.in)

← [Competitor landscape](./README.md)

Researched: 2 Oct 2026. Sources: pumpone.in home page, `/price` and `/mobile-app`, rendered in a browser. The `/feature` detail page was not read in full, and the FAQ answers did not expand (only the questions were captured). Their figures are marketing claims and have not been verified.

## 1. Company snapshot

| | |
|---|---|
| Vendor | Infomuse Technologies, Noida, Uttar Pradesh: an IT services firm. Its other products are eSchool ERP, TrigentERP and LMSMuse |
| Claims | "World class" and "Trusted by global leaders". No install count is published |
| Platforms | **Windows desktop version (works without internet)** and a cloud web version, plus Android and iOS apps (Owner, DSM/attendant, Credit Customer) |
| Go-to-market | Demo-led (request a call back). SEO FAQ targeting Tamil Nadu cities (Erode, Chennai, Madurai, Coimbatore), Marathi and Malayalam, and comparing itself to Tally and PetroByte |
| Support | Mon–Sat 9–7 |

Petrol pumps are one product line of a general software agency, not their focus. The FAQ mentioning PetroByte by name suggests PetroByte is the competitor they see most.

## 2. Their USPs

1. **Two ways to buy:** own the software (one-time fee plus a small yearly renewal) or a monthly subscription. Of the four competitors, only PumpOne offers both.
2. **Windows offline version** for pumps with poor internet, alongside the cloud version.
3. **Three role apps:**
   - **Owner:** live sales, tank stock, credit outstanding, alerts.
   - **DSM (attendant):** bills in 3 taps, nozzle readings, duty sheet, shift closing.
   - **Credit customer:** bills, statements, balances.
4. **Stock and quality depth:** dip readings, **density history**, **fuel sampling**, **evaporation entry**, quick dip check, tank-wise details, tanker trip entry.
5. **Accounting and office:** bank reconciliation, debtors management, expense register, **cheque printing**, VAT/GST reports.
6. **Billing:** periodic billing, short-term credit, counter billing, one-click billing, petro card and swipe card sales, SMS and email.
7. **Staff:** attendance sheet, payslips, payroll; DSM shortage tracking (FAQ Q1).
8. **Multi-pump:** reports per pump and across all pumps, on one dashboard.
9. **Claimed:** handling of midnight price revisions, migration from older software or Excel, local-language support (FAQ questions only; the answers weren't captured).

## 3. Their pricing

Prices as published; the page doesn't say whether GST is included. **The tiers are gated by app and user count, not by feature.**

### Own the software (one-time fee + annual renewal)

| | Standard | Premium | Pro |
|---|---|---|---|
| First year | ₹25,000 | ₹30,000 | ₹40,000 |
| 2nd year onwards | ₹5,000/yr | ₹6,000/yr | ₹8,000/yr |
| Web version | ✓ | ✓ | ✓ |
| Users | 1 | Up to 15 | Unlimited |
| DSM app | ✗ | ✓ | ✓ |
| Owner app | ✗ | ✓ | ✓ |
| Credit Customer app | ✗ | ✗ | ✓ |

### Monthly subscription (SaaS)

| | Standard | Premium | Pro |
|---|---|---|---|
| Per month | ₹899 | ₹1,099 | ₹1,299 |
| Per year | ₹10,788 | ₹13,188 | ₹15,588 |
| Same inclusions as above | | | |

Cost over 3 years for one pump:
- Own the software: Standard ₹35k, Premium ₹42k, Pro ₹56k.
- Subscription: Standard ₹32k, Premium ₹40k, Pro ₹47k.

Notes:
- The upgrade path is: one user on web → owner and attendant apps with 15 users → the customer app and unlimited users.
- The jump from Standard to Pro is only ₹400 a month, which pushes most buyers to the top tier.
- The site doesn't say whether multi-pump costs one licence per pump or how the Windows offline version is priced. Ask.

## 4. Feature comparison: PumpOne vs PumpOS

Legend: ✅ have · 🟡 partial · ❌ missing · 🗺 on our roadmap

| Area | PumpOne | PumpOS | Who leads |
|---|---|---|---|
| Nozzle readings, multiple shifts | ✓ | ✅ | Even |
| DSM shortage tracking | ✓ (claimed) | ✅ two levels: each attendant's drawer, then the office count at shift close | **PumpOS** (depth) |
| Shift and day reports that can't be altered | Shift and salesman reports | ✅ frozen Shift Summary and DSSR | **PumpOS** |
| Audit trail | Not advertised | ✅ an event for every change; mistakes voided, not edited | **PumpOS** |
| Dip, tank-wise stock | ✓ | ✅ | Even |
| Density history, fuel sampling, evaporation | ✓ | ❌ / 🟡 variance only | **PumpOne** |
| Tanker trip entry | ✓ | ❌ | PumpOne |
| Fuel and lubricant purchases | ✓ | ✅ | Even |
| Card / swipe / petro card sales | ✓ | ✅ terminals per shift | Even |
| Counter billing, periodic billing, short-term credit | ✓ | 🟡 invoices; no periodic statements | **PumpOne** |
| Credit customer app | Pro tier | ❌ | PumpOne |
| SMS/email | ✓ | 🗺 | PumpOne |
| Accounting / ledger | ✓ | ✅ ledger, P&L, cash book | Even |
| Bank reconciliation | ✓ | 🟡 a "reconciled" flag only; statement import deferred | **PumpOne** |
| Cheque printing | ✓ | ❌ | PumpOne (niche) |
| VAT/GST reports | ✓ | ✅ VAT/GST split · 🟡 no GSTR export | Even |
| Tally export | Not advertised | 🗺 | — |
| Attendance, payslips | ✓ | 🗺 / ❌ | **PumpOne** |
| Offline | Windows version works offline | 🟡 desktop app shell; no queue for offline writes yet | **PumpOne** |
| Desktop app | Windows | ✅ Tauri (Windows/macOS) | Even |
| Multi-pump dashboard | ✓ | ✅ multiple stations · 🗺 consolidated reports | PumpOne (consolidated view) |
| Owner app | ✓ live | 🟡 read-only first version | PumpOne |
| Multi-language | Claimed in FAQ | ❌ | PumpOne (claimed) |

**Summary.** PumpOne is a broad, conventional product sold by an IT agency. Its strengths are the choice of buying or subscribing, a Windows version that works offline, and stock and quality checks (density, sampling, evaporation). It doesn't advertise Tally export or anything about audit or accountability, and it's demo-led with no self-serve trial. We beat it on reconciliation depth, frozen reports and the audit trail. It beats us on stock and quality checks, bank reconciliation, attendance and payroll, and apps.

## 5. Roadmap implications

PumpOne adds evidence for features already on our list:

| Feature | Seen in | Our status |
|---|---|---|
| Density / fuel quality records | Petrosoft, PumpOne | ❌ → **P2, now confirmed** (density, sampling, evaporation as variance reasons) |
| Credit customer app / portal | All 4 | ❌ → raise to **P2** (start with a statement link) |
| Attendance + payslip | Petrosoft, PetroByte, PumpOne | ❌ → **P2** |
| Bank reconciliation (statement import) | PetroByte, PumpOne | 🟡 → P2 |
| Offline operation | FuelSetu, PumpOne | 🟡 → keep the Level 2 plan; make sure the desktop app keeps working through outages |
| Counter / periodic billing | PetroByte, PumpOne | 🟡 → P2 |
| Cheque printing | PumpOne | P3 |

## 6. Pricing implications

The market for one pump over one year (excl. GST where stated):

| Vendor | Model | Effective ₹/yr (year 1) | Effective ₹/yr (over 3 years) |
|---|---|---|---|
| PetroByte | Subscription, every feature | ₹7,000 | ₹5,500 |
| PumpOne SaaS | Monthly, gated by apps and users | ₹10,800 – ₹15,600 | same |
| PumpOne own | One-time fee + renewal | ₹25,000 – ₹40,000 | ₹11,700 – ₹18,700 |
| FuelSetu | Subscription, every feature | ₹18,000 | ₹12,600 |
| Petrosoft | Gated by tier | ₹17,000 – ₹48,000 | not published |

What this tells us:
1. **₹900–₹1,300 a month is the market's middle.** PumpOne's subscription prices line up with our proposed Basic (₹6,999) and Pro (₹12,999) annual prices. The recommendation from the PetroByte report still holds.
2. **Gating by apps and users is common and accepted.** Both Petrosoft and PumpOne gate the attendant, owner and customer apps by tier. This supports our plan to make **seats** (attendant, manager, customer portal) the reason to upgrade from Basic to Pro.
3. **Offer monthly billing.** PumpOne publishes monthly prices; cash-conscious dealers prefer them. Suggested: Basic ₹699/mo, Pro ₹1,299/mo, or the annual prices with about 2 months free.
4. **Don't offer "own the software".** It conflicts with being cloud-first and with frequent updates, and our cloud is the source of truth. Answer the dealer's real worry, "what if you shut down or I stop paying?", with **guaranteed data export**, as PetroByte does.

## 7. Comparison across competitors

Moved to the [competitor landscape](./README.md).
