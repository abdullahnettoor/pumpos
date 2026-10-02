# Periodic compliance obligations for Indian retail fuel stations

Retrieved: 3 Oct 2026. Status: **first pass, mostly unverified**. Read "Confidence and gaps" before relying on any figure.

## How to read this document

Each claim carries one of three markers:

- **[V]** Verified: read on a primary source page during this research (URL given).
- **[P]** Primary source identified but not read: the page is a PDF or loads through JavaScript, and the fetch tool could not read its text. The URL is the right place to confirm the claim.
- **[U]** Unverified: from general knowledge of the sector. No source was retrieved. Confirm before using it in product copy or in any statement to a customer.

Most government primary sources timed out or only exposed a PDF link: indiacode.nic.in (timeout), consumeraffairs.nic.in (timeout), the cpcb.nic.in VRS guideline (404), the PESO FAQ and SOP (PDF behind a viewer). A Wikisource copy of the Legal Metrology Act returned 404, and indiankanoon.org returned "Act/Judgment not found". **Most rows below are therefore [U] or [P].**

## Summary

- A retail outlet (RO) has to keep about 25 recurring obligations current. They come from four layers:
  - **central statute**: PESO, Legal Metrology, the Environment and Water/Air Acts, GST, EPF/ESI
  - **state agencies**: Legal Metrology Controllers, Fire Services, Pollution Control Boards, the Electrical Inspectorate, Shops & Establishments
  - **municipal bodies**: trade licence
  - **the oil marketing company (OMC)**: dealership agreement and the Marketing Discipline Guidelines (MDG)
- The obligations that end the business are the **PESO Form XIV licence** (selling without it is an offence under the Petroleum Act 1934), **Legal Metrology verification of dispensers** (unverified dispensers can be sealed) and **MDG critical irregularities** (adulteration or tampering can lead to suspension or termination of the dealership). [U]
- State variation is large in fire NOC validity, PCB consent category and validity, and trade licence cycles. It is small for PESO and GST, which are central. [U]
- No Indian fuel-station software found so far offers a structured compliance calendar. Petrosoft advertises generic "Expiry Item Reminders" and "Renewal alerts". PetroByte, FuelSetu and PumpOne do not market one. This comes from the competitor brief; see `docs/research/competitors/`.

## Master table

| # | Obligation | Authority | Legal basis | What must be done | Frequency / validity | Inspector | Penalty / consequence of lapse | Varies by state? | Source | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Licence to store petroleum Class A/B at an RO (Form XIV) | Central: PESO (CCE, Nagpur, with circle offices) | Petroleum Act 1934; Petroleum Rules 2002 | Hold a valid licence for the approved tankage and layout. Renew online before expiry. Amend for any change in tanks or layout. | Renewable for up to 10 years per renewal (U). PESO's homepage names the RO licence as "Form-XIV of PR-2002" (V). | PESO Controller of Explosives | Storage or sale without a licence is an offence under Petroleum Act s.23: fine and/or imprisonment (U). OMC stops supply (U). | No (central) | https://peso.gov.in/web/ (Form XIV, V); FAQ PDF: https://peso.gov.in/web/en/faqs-petroleum-rules-2002 (P); SOP: https://peso.gov.in/web/en/sop-approvals-licenses-issued-under-petroleum-rules-2002 (P) | V/U |
| 2 | CNG dispensing station licence | Central: PESO | Gas Cylinders Rules 2016 (cascade, Form G/F); SMPV(U) Rules 2016 where applicable | Licence for compression and dispensing. Cascade cylinders tested at an approved testing station. | Licence renewable (U). Cascade and vehicle CNG cylinders: periodic hydrostatic test, generally every 5 years (U). | PESO; approved Gas Cylinder Testing Station | Using untested cylinders is an offence under the Explosives Act 1884 via GCR (U). The CGD company or OMC stops supply (U). | No | PESO menus list "Gas Cylinder Rules 2016" and "Approved CNG Cylinders Testing Station": https://peso.gov.in/web/ (V for existence) | P/U |
| 3 | Auto-LPG dispensing station (ALDS) licence | Central: PESO | SMPV(U) Rules 2016 | Licence for the storage vessel. Approved installer and operator. Periodic pressure vessel test by a Competent Person. | Licence renewable. Vessel test about every 5 years (U). | PESO; recognised Competent Person | Licence cancellation or prosecution (U) | No | PESO menus list "Approved ALDS Installer/Operator" and "Recognized Competent Person": https://peso.gov.in/web/ (V for existence) | P/U |
| 4 | Verification and stamping of fuel dispensers (each nozzle) | State Controller of Legal Metrology | Legal Metrology Act 2009 ss.24–25; LM (General) Rules 2011 | Present dispensers for re-verification. Seal (stamp) and certificate. Re-verify after any repair. | Annual (U) | Inspector, Legal Metrology | s.25 (use of unverified W&M): fine up to ₹10,000; ₹50,000 for a second or later offence and/or imprisonment (U; amounts later changed by the Jan Vishwas Act 2023, unconfirmed). Short delivery under s.30: fine up to ₹10,000 (U). Dispenser sealing (U). | Fee schedules are state-specific; periodicity is the same everywhere | https://consumeraffairs.nic.in (timed out) | U |
| 5 | Calibration of underground tanks and tank charts | State Legal Metrology; OMC | LM (General) Rules 2011, storage tank provisions | Tank calibration chart verified and stamped | 5-yearly (U) | Legal Metrology Inspector | As row 4; OMC MDG observation (U) | Fees vary | n/a | U |
| 6 | 5-litre measure (standard measure for delivery checks) | State Legal Metrology | LM Act 2009 / LM (General) Rules 2011 | Keep a stamped 5 L measure and let customers check delivery on request | Annual re-verification (U) | LM Inspector; OMC officers | s.25 fine (U); MDG penalty for a missing or unstamped measure (U) | Fees vary | n/a | U |
| 7 | Hydrometer and thermometer for the density check | OMC (MDG); BIS/LM for instruments | MDG; IS 1448 methods (U) | Keep calibrated hydrometers, a thermometer and a jar. Record density on receipt and daily. | Periodic calibration per OMC (U) | OMC Sales Officer | MDG penalty (U) | No | n/a | U |
| 8 | OMC Marketing Discipline Guidelines compliance | OMC (IOCL/BPCL/HPCL, as common MDG) | MDG (latest public version 2012, revised later per OMC circulars) (U); dealership agreement | Correct quantity and density, no adulteration, filter paper test, display boards, free air, toilets, drinking water, fire extinguishers, complaint book, stock records | Continuous; surprise inspections; periodic OMC inspections (U) | OMC Sales Officer / Mobile Lab | Graded penalties (U): "critical" (adulteration, tampered dispenser, unauthorised fitting) leads to suspension of sales and supplies and **termination** on first or second instance. "Major/minor" (missing facilities, short delivery within limits, display lapses) carry fines that escalate per instance (indicatively ₹10,000 to ₹1,00,000+), then suspension. | No (pan-OMC) | iocl.com / bharatpetroleum.in / hindustanpetroleum.com: MDG not fetched | U |
| 9 | Fire NOC / Fire Safety Certificate | State Fire & Rescue Services (sometimes the municipal fire department) | State Fire Services Acts, e.g. Maharashtra Fire Prevention & Life Safety Measures Act 2006; Kerala Fire Force Act 1962; TN Fire Service Act 1985 (U); NBC 2016 Part 4 | Obtain NOC. Renew on schedule. Maharashtra additionally requires half-yearly Form B maintenance certificates from a licensed agency (U). | Varies: 1–5 years (see state table) (U) | Fire Officer | Sealing, prosecution under the state Act (U) | **Yes, strongly** | n/a | U |
| 10 | Fire extinguishers: maintenance, refill, hydro test | Fire Services; OMC (MDG checks count and charge) | IS 2190:2010 (U) | Quarterly inspection, annual maintenance, refill as needed; hydraulic pressure test per IS 2190 schedule (U) | Quarterly / annual; HPT typically 3–5 years depending on type (U) | Fire officer; OMC | MDG penalty for missing or discharged extinguishers (U); fire NOC refusal | No (IS standard) | n/a | U |
| 11 | Consent to Establish / Operate (CTE / CTO) | State Pollution Control Board / PCC | Water Act 1974 s.25; Air Act 1981 s.21 | Hold valid CTO; renew; comply with conditions (oil-water separator, VRS where applicable) | Validity set by each SPCB per category: commonly 5 years (Orange) to 10/15 years or one-time (Green/White) (U) | SPCB Environmental Engineer | Water Act s.41/44 and Air Act s.37: imprisonment 1.5–6 years plus fine (U; Jan Vishwas Act 2023 replaced several of these with penalties, unconfirmed). Closure direction under s.33A/31A (U). | **Yes** | CPCB category doc (fetch returned empty HTML): https://cpcb.nic.in | U |
| 12 | Vapour Recovery System (Stage I / Stage II) | CPCB / SPCB; OMC | CPCB directions under Air Act s.18(1)(b) (U); NGT orders (U) | Install VRS at qualifying ROs: Stage II mandated for ROs above a monthly sale threshold in cities with million-plus population (U). Periodic efficiency testing. | Annual VRS efficiency test (U) | SPCB; OMC | Environmental compensation and closure direction (U) | Applicability differs by city | n/a | U |
| 13 | Oil-water separator / effluent | SPCB | CTO conditions | Maintain the OWS and dispose of sludge | Per CTO conditions | SPCB | As row 11 | Yes | n/a | U |
| 14 | Hazardous waste (tank sludge, used oil) authorisation and returns | SPCB | Hazardous & Other Wastes Rules 2016 | Authorisation if applicable; annual return (Form 4) by 30 June (U); disposal through an authorised recycler or TSDF | Annual return | SPCB | Environmental compensation (U) | Yes | n/a | U |
| 15 | DG set emission and noise norms | CPCB / SPCB | EP Rules 1986, Sch. I (DG set norms) (U) | Type-approved DG set with acoustic enclosure; stack height; any required CTO | Per CTO | SPCB | EP Act s.15 (U) | Some | n/a | U |
| 16 | Electrical installation inspection | State Electrical Inspectorate (CEA regulations) | CEA (Measures relating to Safety and Electric Supply) Regulations 2023 (earlier 2010) (U) | Periodic inspection or self-certification; hazardous-area (flameproof) equipment | Up to 5-yearly for LT/HT per CEA reg. (U); some states require annual | Electrical Inspector | Disconnection of supply; penalty under Electricity Act s.146 (U) | Yes | n/a | U |
| 17 | Earthing and lightning arrestor resistance tests | OMC / PESO conditions | OMC safety standards; OISD-STD-117/118 (U) | Measure and record earth-pit resistance | Half-yearly / annual (U) | OMC | MDG observation (U) | No | n/a | U |
| 18 | UG tank and pipeline leak / integrity tests | OMC / PESO | Petroleum Rules 2002; OMC SOP; OISD (U) | Leak or pressure test of tanks and lines; double-wall tank interstitial monitoring | Periodic per OMC (U); after any repair | OMC / PESO | Licence condition breach (U) | No | n/a | U |
| 19 | Trade licence | Municipal body / panchayat | State municipal corporation or panchayat Acts | Obtain and renew | Mostly annual (financial year) (U) | Municipal health or revenue officer | Late fee or sealing (U) | **Yes** | n/a | U |
| 20 | Shops & Establishments registration | State Labour Dept | State S&E Acts | Register; renew where renewal still applies | Lifetime in Maharashtra under the 2017 Act (U); periodic in some states | Labour Inspector | Fine under the state Act (U) | Yes | n/a | U |
| 21 | Contract labour, EPF, ESI, minimum wages, PT | Central / State Labour; EPFO; ESIC | CLRA 1970; EPF Act 1952; ESI Act 1948; state PT Acts; Labour Codes once notified (U) | Monthly ECR (EPF) and ESI contributions by the 15th; PT monthly or annual; annual returns | Monthly / annual | EPFO / ESIC / Labour inspectors | Damages under EPF s.14B (up to 100% of arrears) and interest under s.7Q (12% p.a.) (U) | PT and minimum wages vary | n/a | U |
| 22 | FSSAI registration/licence (convenience store) | FSSAI / State Food Safety | FSS Act 2006; Licensing Regs 2011 | Register if turnover ≤ ₹12 L, otherwise state licence; annual return where applicable | 1–5 years chosen at application (U) | Food Safety Officer | Selling without a licence: up to 6 months' imprisonment and ₹5 L fine under s.63 (U) | Little | n/a | U |
| 23 | GST returns (on lubes, shop, services; petrol, diesel and natural gas are outside GST) | Central/State GST | CGST Act 2017 | GSTR-1 / GSTR-3B monthly or quarterly; annual GSTR-9 | Monthly / annual | GST officers | Late fee per day and 18% interest (U) | No | n/a | U |
| 24 | State VAT on MS/HSD | State Commercial Taxes | State VAT Acts | Fuel VAT returns (OMC collects and dealer files; arrangements differ by state) (U) | Monthly / quarterly | State tax officer | Interest and penalty (U) | **Yes** | n/a | U |
| 25 | Insurance (property, fire, public liability) | OMC (dealership condition); Public Liability Insurance Act 1991 for hazardous substances (U) | Dealership agreement; PLI Act | Keep policies current | Annual | OMC | MDG observation; uninsured loss (U) | No | n/a | U |
| 26 | First aid, fire drills, staff safety training | OMC / Fire Services | MDG; OISD-STD-244 (U) | First-aid box; mock drills; trained attendants | Monthly / quarterly drills per OMC (U) | OMC | MDG observation (U) | No | n/a | U |
| 27 | Display boards (prices, stock, licences, complaint numbers) | OMC / Legal Metrology | MDG; LM rules | Up-to-date displays | Daily (prices) / continuous | OMC; LM | MDG penalty (U) | No | n/a | U |

## State comparison (all [U] unless noted)

| Item | Kerala | Maharashtra | Tamil Nadu | Karnataka | Uttar Pradesh | Rajasthan |
|---|---|---|---|---|---|---|
| Fire NOC validity / renewal | KFRS; renewal commonly annual for hazardous occupancies (U) | Fire NOC plus mandatory **half-yearly Form B** (Jan and Jul) from a licensed fire agency under the MFP&LSM Act 2006 (U) | TNFRS licence, renewal often annual or 2–3 yearly (U) | KSFES NOC; renewal cycle unclear (U) | UPFS: NOC renewal 1–3 years depending on category (U) | RFS / municipal fire wing; annual (U) |
| PCB category for retail outlets | KSPCB (Kerala lists ROs as "Green"/"Orange" per its own list) (U) | MPCB: Green (U) | TNPCB: Orange (U) | KSPCB: Orange/Green (U) | UPPCB: Green (U) | RSPCB: Green/Orange (U) |
| CTO validity | Up to 5 years (U) | Green: 5 yr+ (U) | Orange: 5 yr (U) | 5–10 yr (U) | Green: 10–15 yr (U) | Up to 10 yr / one-time (U) |
| Legal Metrology fee | State LM fee schedule per nozzle (U) | Per nozzle (U) | Per nozzle (U) | Per nozzle (U) | Per nozzle (U) | Per nozzle (U) |
| Trade licence cycle | LSGD panchayat/municipal, annual (U) | Municipal corporation, annual or multi-year (U) | Annual (U) | Annual (BBMP in Bengaluru) (U) | Annual (U) | Annual (U) |

Note: in 2016 CPCB reclassified industries into Red, Orange, Green and White, and SPCBs adopt the list with modifications. Retail outlets are commonly reported under Green; consent validity differs by board. [U]

## Opportunity for PumpOS: compliance calendar

Competitors only offer generic expiry reminders: Petrosoft lists "Expiry Item Reminders" and "Renewal alerts". PetroByte, FuelSetu and PumpOne do not market a compliance calendar. PumpOS could ship a domain-aware **Compliance Register**:

**Per obligation (template, seeded per state and fuel mix):**
- obligation type (from the master table), authority, legal basis, state
- applicability rules (CNG present? ALDS? convenience store? DG set? VRS-qualifying city/volume?)
- default frequency (annual, half-yearly, 5-yearly, monthly) and lead time for reminders

**Per station instance:**
- `organization_id`, `station_id`; scope item (station / tank / dispenser / nozzle / cylinder cascade / extinguisher)
- licence or certificate number, issue date, **valid-until / next-due date**
- document uploads (certificate, challan, test report), with immutable history of previous versions
- responsible person (user), backup person
- status: current / due soon / overdue / lapsed / not applicable
- evidence of completion (photo, report, inspector name, fee paid, receipt)
- reminders at T-90 / T-30 / T-7 / overdue via in-app, email and WhatsApp (later)
- audit trail as business events (`COMPLIANCE_ITEM_RENEWED`, `COMPLIANCE_ITEM_LAPSED`)

**Operational hooks unique to PumpOS:**
- Link dispenser and nozzle LM stamping to the nozzles already modelled. Warn at shift open if a nozzle's stamping has expired.
- Link tank calibration charts to tanks; density/hydrometer checks to the DSSR.
- An MDG self-inspection checklist (free air, toilets, extinguishers, 5 L measure, filter paper test) logged daily or weekly, giving the dealer evidence for OMC visits.
- An owner dashboard tile showing items overdue or due in 30 days, across all stations.

Consistent with AGENTS.md: snapshot history is never edited (renewals append), the data is tenant-scoped, and it goes in the semi-static cache tier.

## Confidence and gaps

Retrieved and read (V):
- PESO homepage https://peso.gov.in/web/: the RO licence is "Form-XIV of PR-2002". The page lists the Gas Cylinder Rules 2016, SMPV(U) Rules 2016, approved CNG cylinder testing stations, ALDS installers/operators and Competent Persons, and the online renewal portal (https://online.peso.gov.in/PesoOnline/).
- PESO FAQ and SOP pages exist, but their content is PDF-only and was not read (P).

Not verified (everything marked U), most importantly:
1. PESO Form XIV renewal period, fees, and the Petroleum Act s.23 penalty amounts.
2. Legal Metrology Act s.25/s.30/s.33 fine amounts, especially after the **Jan Vishwas (Amendment of Provisions) Act 2023**, which decriminalised several LM and environmental offences and changed the amounts.
3. Annual dispenser verification and 5-yearly tank calibration periodicity (LM General Rules 2011 schedule).
4. All MDG penalty amounts and categories. The MDG is not public on the OMC sites that were tried.
5. Every state figure in the comparison table (fire NOC validity, PCB category and CTO validity, LM fees, trade licence cycles).
6. CPCB VRS applicability thresholds and test frequency.
7. CEA 2023 regulation inspection periodicity.
8. IS 2190 hydro-test intervals.
9. Gas cylinder and pressure vessel retest intervals under GCR/SMPV 2016.

Next steps: download and read the PESO FAQ/SOP PDFs, the LM General Rules 2011 text on indiacode, the CPCB category list and VRS directions, and one MDG copy from an OMC dealer circular. For each target state, read the fire service and SPCB citizen charters.
