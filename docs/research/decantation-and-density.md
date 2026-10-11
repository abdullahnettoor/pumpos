# Research: Decantation and density at Indian retail outlets

← [Research index](./competitors/README.md)

Researched: 7 Oct 2026. Question: how does tanker unloading ("decantation") and the density check work at an Indian retail outlet (RO), and how should PumpOS model it?

**Source status.** Rows marked **(V)** were checked against a fetched primary source. Rows marked **(U)** are industry practice that I could not verify against a primary document in this session: the OMC Marketing Discipline Guidelines (MDG) and the dealer Operations Manuals are not public (iocl.com returned a redirect wall), BIS IS 1460 / IS 2796 and the API/ASTM tables are paywalled. Treat every (U) number as a **configurable default**, not a hard-coded rule. Confirm with a dealer's current OMC circular before shipping.

| Source                                                                                        | What it confirms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ASTM D1250-19e1 / API MPMS Ch. 11.1 product page (astm.org/d1250-19e01.html, active D1250-25) | VCF is the "Adjunct" algorithm; metric procedures support base 15 °C and 20 °C; at 1 atm there is no pressure correction and results match the 1980 tables; commodity groups crude / refined products / lubes; refined products split into **gasoline (≈50–85 °API), jet/kerosene (≈37–50 °API), fuel oils incl. auto diesel (≈−10–37 °API)**, and "the product should be allocated to the class appropriate to its density, not its descriptor"; glass-hydrometer thermal correction is out of scope of the Adjunct (see API MPMS Ch. 9) | V      |
| ISO 91 (Petroleum measurement tables, reference 15 °C)                                        | India trades at 15 °C reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | U      |
| IS 1460 (diesel) / IS 2796 (motor gasoline) spec density bands                                | HSD density at 15 °C ≈ 820–860 kg/m³ (BS-VI: 815–845 U); MS ≈ 720–775 kg/m³                                                                                                                                                                                                                                                                                                                                                                                                                                                               | U      |
| OMC MDG / RO Operations Manual                                                                | Decantation procedure, ±3 kg/m³ tolerance, density register, display of density                                                                                                                                                                                                                                                                                                                                                                                                                                                           | U      |
| Legal Metrology (Packaged / General Rules 2011)                                               | Tank calibration charts, dip rods, 5 L measure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | U      |
| PESO (Petroleum Rules 2002)                                                                   | Unloading safety: earthing, no sale/smoking near fill point, fire extinguishers at decantation point                                                                                                                                                                                                                                                                                                                                                                                                                                      | U      |

The compliance survey (`../compliance/fuel-station-compliance.md`, row 7–8) already lists "hydrometer + thermometer, record density on receipt and daily" as an MDG item, also (U).

## 1. Decantation workflow at an RO

Terminology: OMCs call unloading a tank lorry (TL / TT) into an underground tank "decantation". Note that `GLOSSARY.md` uses "decanting" as an _avoid_ word for **Tank Transfer**. The PumpOS term should be **Receipt** (or "Decantation"); see §5.

Typical sequence (all U, consistent across dealer training material and competitor manuals):

1. **Arrival and documents.** TL arrives with the OMC invoice / delivery challan. The invoice states product, **quantity in litres at ambient (observed) temperature and at 15 °C**, **invoice density at 15 °C**, loading temperature, TL number, compartment-wise quantities and the seal numbers.
2. **Seal and TL checks.** Dealer checks that the top-cover and discharge-valve **seals** are intact and match the invoice. TL compartments carry a **dip/calibration mark** ("dip plate" / "stencil"); the dealer may check product level against the TL calibration chart (Legal Metrology–stamped TL chart). Shortage beyond tolerance is noted on the invoice before decanting.
3. **Pre-decant tank dip.** Dip the receiving tank with a graduated dip rod; apply **water-finding paste** to detect bottom water; read product height (cm/mm) and water height. Convert to litres from the **tank calibration chart**.
4. **Sample and density check.** Draw a sample from each TL compartment into a 500 mL / 1 L glass jar, read **observed density with a hydrometer** and **temperature with a thermometer**, convert to **density at 15 °C** using the conversion table (the OMC-issued booklet derived from the 15 °C petroleum measurement tables, Table 53B equivalent). Compare with invoice density.
5. **Tolerance.** Commonly applied: **±3.0 kg/m³** between observed-converted density and invoice density (U). Outside tolerance: do not decant, record in the TL-delivery register, inform the OMC Sales Officer / Territory Office, keep the sample sealed (retained samples) and the TL waits for OMC instructions. Some OMCs also require a **filter-paper test** for MS (evaporates without stain) (U).
6. **Sale halt.** Sales from the receiving tank's nozzles stop during decantation and for a settling period (commonly ~15–30 min) before the post-dip (U). Earthing of the TL, fire extinguishers placed, engine off (PESO practice, U).
7. **Decant** via the fill pipe, compartment by compartment. TL compartments are drained fully ("dry-out" / drain-check by opening the bottom valve or dipping the empty compartment) to ensure no retained product (U).
8. **Post-decant dip** after settling, again with water paste.
9. **Record.** Receipt in the stock register: pre-dip, post-dip, sales during decant, net receipt, invoice qty, short/excess, density observed/at 15 °C, sign-off by dealer and driver. The **new density** after receipt is recorded and becomes the displayed density (U).

**Transit loss / short receipt.** OMCs allow a small evaporation/transit tolerance on MS (often quoted ~0.1–0.2 % or a fixed litres per KL) and less on HSD; dealers claim shortages above that from the transporter. Figures vary by OMC and circular and were **not verifiable** (U). Treat as station-configurable per product.

**MS vs HSD specifics (U).** MS: higher volatility, larger temperature effect (α ≈ 0.0012/°C), filter-paper test, stricter evaporation tolerance. HSD: lower α (≈ 0.00084/°C), water/sediment check matters more.

## 2. Density maths

### 2.1 Thermal expansion coefficient (1980 tables = 2004 Adjunct at 1 atm)

For a density at 15 °C, ρ15 (kg/m³), the coefficient at the base temperature is:

```text
α15 = K0 / ρ15² + K1 / ρ15             (and for the transition band: α15 = A + B / ρ15²)
```

Constants (Table 54B, generalized refined products; from the published 1980 constants, U as the standard text was not fetched):

| Class (by ρ15, kg/m³)         | K0       | K1     | A           | B         |
| ----------------------------- | -------- | ------ | ----------- | --------- |
| Gasoline 653–770              | 346.4228 | 0.4388 |             |           |
| Transition 770–787.5          |          |        | −0.00336312 | 2680.3206 |
| Jet / kerosene 787.5–839      | 594.5418 | 0      |             |           |
| Fuel oils (incl. diesel) 839+ | 186.9696 | 0.4862 |             |           |

D1250 (V) says to classify by density, not name: an Indian HSD at ≈830 kg/m³ falls in the jet band.

### 2.2 Volume correction factor

```text
ΔT  = T_observed − 15
VCF = CTL = exp( −α15 · ΔT · (1 + 0.8 · α15 · ΔT) )
V15 = V_observed × VCF
```

### 2.3 Observed density → density at 15 °C (Table 53B logic)

The density at T is ρT = ρ15 × CTL(ρ15, T). Since α depends on ρ15, solve by iteration:

```text
ρ15₀ = ρT
repeat: ρ15ₙ₊₁ = ρT / CTL(ρ15ₙ, T)    until |Δ| < 0.01 kg/m³  (2–4 iterations)
```

A glass hydrometer also needs a glass-expansion correction (D1250 §5.4, V: out of scope, see API MPMS Ch. 9). The 1980 Table 53 folded in a factor of approx. `1 − 0.000023·ΔT − 0.00000002·ΔT²` (U). The OMC booklet values include it, so PumpOS should apply it behind a flag and test against the booklet.

### 2.4 Mass

```text
mass (kg) = V15 (L) × ρ15 (kg/m³) / 1000
```

### 2.5 Worked example (HSD, glass correction ignored)

Sample: hydrometer 828.0 kg/m³ at 32 °C. ΔT = 17.

| Iteration | ρ15 guess | class    | α15        | CTL      | ρ15 = 828 / CTL |
| --------- | --------- | -------- | ---------- | -------- | --------------- |
| 1         | 840.0     | jet      | 0.00084262 | 0.985616 | 840.08          |
| 2         | 840.08    | fuel oil | 0.00084368 | 0.985598 | **840.10**      |

Invoice density 842.0 → difference −1.9 kg/m³ → within ±3 (U) → accept.

Receipt volume: net observed 12,000 L at tank temperature 30 °C (ΔT = 15):
`αΔT = 0.012655; VCF = exp(−0.012655 × 1.010124) = 0.987298` → **V15 = 11,847.6 L**, **mass = 11,847.6 × 0.84010 = 9,953 kg**. If the invoice states 11,900 L at 15 °C, the short receipt is 52.4 L at 15 °C (0.44 %).

Gasoline check: MS ρ15 = 745 → α15 = 346.4228/745² + 0.4388/745 = **0.0012132 /°C**, so a 15 °C swing moves volume ≈1.8 %. That is why invoices quote both observed and 15 °C quantities.

### 2.6 Density register and display (U)

Industry practice under MDG: record density **each morning** (opening density per tank/product), **after every receipt**, and on customer demand; **display current density** (at 15 °C) on a board at the forecourt; keep a density register for Sales Officer inspection. Customers may ask for a density check. Not verified against a published MDG text.

## 3. Dip → volume and receipt quantity

**Calibration chart.** Each underground tank has a Legal Metrology–approved chart: dip height (cm or mm) → litres, typically per cm with per-mm increments. Cylindrical horizontal tanks are non-linear, so use the chart, not geometry. Between rows use **linear interpolation**:

```text
V(h) = V(h₀) + (h − h₀) × (V(h₁) − V(h₀)) / (h₁ − h₀)      h₀ ≤ h ≤ h₁
productVolume = V(productHeight) − V(waterHeight)
```

**Receipt quantity.**

```text
receivedObserved = V(postDip) − V(preDip) + nozzleSalesDuringDecant
receivedAt15     = receivedObserved × VCF(ρ15_new, tankTemp)    (when temperature captured)
shortExcess      = receivedAt15 − invoiceQtyAt15                (or observed vs observed)
```

`nozzleSalesDuringDecant` is zero when sales were halted (the normal case). Otherwise it comes from nozzle readings between the two dips.

## 4. Competitors

From `competitors/*.md`:

| Feature                                 | Petrosoft                    | FuelSetu        | PetroByte   | PumpOne                  | PumpOS |
| --------------------------------------- | ---------------------------- | --------------- | ----------- | ------------------------ | ------ |
| Density readings                        | ✓ (in all plans, incl. Lite) | not advertised  | not adv.    | ✓ density **history**    | ❌     |
| Decantation (ordered/received/unloaded) | ✓                            | —               | ✓ (tanker)  | tanker trip entry        | ❌     |
| Tank calibration charts                 | —                            | ✓ (unconfirmed) | —           | —                        | 🟡     |
| Sampling / evaporation                  | —                            | —               | evaporation | ✓ sampling + evaporation | ❌     |
| Dip-sale vs meter-sale variance         | ✓                            | dips + variance | ✓           | quick dip check          | ✅     |

Petrosoft keeps density in its cheapest plan as an "oil-company compliance" item. The landscape README ranks "Density + decantation" as roadmap item **#7 (T2, ungated)**. Nobody publicly documents the 15 °C maths; they appear to store the dealer's reading and invoice values.

## 5. PumpOS fit

### 5.1 What exists today

- `tanks` (`packages/db/src/schema.ts:107`): name, product, capacity. **No calibration chart, no dip-rod unit.**
- `purchases` / `purchase_items` (`schema.ts:894`): business-day anchored (ADR 0005), `tankAllocations` JSONB splits a fuel line across tanks; `RecordPurchase` (`packages/core/src/capabilities/purchasing/record-purchase.ts`) posts `Purchase` stock movements per tank. **The invoice quantity is booked as stock**; nothing records what was actually received.
- `stock_movements.movement_type` already lists `'Decantation'` in a comment (`schema.ts:667`) but nothing writes it. Note the naming clash with `GLOSSARY.md` (decanting = avoid term for Tank Transfer).
- `RecordStockCount` (`packages/core/src/capabilities/inventory/record-stock-count.ts`) takes a dip as **litres** (`actualQuantity`), writes `stock_variances` and a `Variance` movement. Events `TANK_DIP_RECORDED`, `STOCK_MOVEMENT_RECORDED` exist (`packages/core/src/kernel/event-catalog.ts:71-73`).

### 5.2 Proposed domain model

New glossary terms (add to `GLOSSARY.md` via domain-modeling): **Decantation** (unloading a tank lorry into Tanks against a Purchase; _avoid_: decantation, unloading entry), **Density Reading**, **Calibration Chart**.

**Decantation** — forecourt stock event, `business_day_id`, no `shift_id` (same rule as Purchases, ADR 0005).

```text
fuel_receipts
  id, organization_id, station_id, business_day_id
  purchase_id (nullable: receipt may precede invoice entry), supplier_id
  tank_lorry_number, invoice_number, seal_numbers jsonb, seals_intact bool
  invoice_qty_observed, invoice_qty_15, invoice_density_15, invoice_temp
  status: DRAFT | ACCEPTED | REJECTED (density out of tolerance)
  sales_halted bool, received_at, recorded_by, notes, metadata jsonb
fuel_receipt_tanks       (one row per receiving tank)
  receipt_id, tank_id, product_id
  pre_dip_mm, pre_water_mm, pre_volume, post_dip_mm, post_water_mm, post_volume
  sales_during_decant, received_observed, tank_temp, vcf, received_15
  short_excess_qty, tolerance_qty
```

**Density Reading** — one entity for receipt checks, morning opening and ad-hoc checks.

```text
density_readings
  id, organization_id, station_id, business_day_id, tank_id, product_id
  kind: RECEIPT | OPENING | ADHOC | CUSTOMER_REQUEST
  fuel_receipt_id nullable
  observed_density, observed_temp, density_15, invoice_density_15 nullable
  deviation, within_tolerance, recorded_by, recorded_at
```

Store the inputs and the computed result (snapshot-like). Never recompute historical rows when the formula version changes; keep `metadata.formulaVersion`.

**Calibration Chart** — JSONB on `tanks` (rarely queried, per AGENTS.md metadata rule):

```text
tanks.calibration = { unit: 'mm'|'cm', certificateNo, validUntil, rows: [[height, litres], ...] }
```

Validate rows: strictly increasing heights and volumes, last volume ≈ capacity. `validUntil` feeds the existing calibration-renewal reminder idea.

**Stock effect.** On ACCEPT, post a `Purchase`-type movement (or rename the existing comment `'Decantation'` → `'Receipt'`) of `received_observed` per tank, referencing the receipt. If a Purchase already booked invoice qty, post the short/excess as a `Variance` movement with reason `TRANSIT_SHORTAGE` / `TRANSIT_EXCESS` and a `stock_variances` row. Variance stays first-class and visible; never net it silently into the purchase. Decide one rule (see open questions) so stock isn't double-booked.

**Events** (add to `event-catalog.ts`, all with org/station/entity ids, idempotent):
`DECANTATION_RECORDED`, `DECANTATION_FLAGGED`, `DENSITY_RECORDED`, `TANK_CALIBRATION_UPDATED`. `TANK_DIP_RECORDED` for each pre/post dip.

### 5.3 Pure functions

Put in `@pump/shared` (used by API and client for live preview), tested against the OMC booklet and the worked example above:

```ts
alpha15(rho15, productClass?)            // class picked by density per D1250
vcf(rho15, tempC)                        // CTL
density15FromObserved(rhoObs, tempC, { glassCorrection })
volumeAt15(vObs, rho15, tempC)
massKg(v15, rho15)
dipToVolume(chart, heightMm)             // linear interpolation, throws outside range
receiptQuantity({ preVol, postVol, salesDuring })
densityWithinTolerance(rho15, invoiceRho15, tol = 3)
```

Use decimal-safe arithmetic and round only at display/persist (density 0.1 kg/m³, VCF 4–6 dp, volume 0.001 L to match `numeric(12,3)`).

### 5.4 UI flow (List → Drawer)

- **Inventory → Decantations** list: date, TL no., supplier, product, invoice qty, received, short/excess badge, density status.
- **New Decantation drawer** (stepper inside one drawer, no modals): invoice → seals → pre-dip (height entry, chart converts live) → density sample (observed + temp → shows ρ15, deviation, green/red) → post-dip → summary and accept/reject. Allow saving a DRAFT between pre- and post-dip (settling takes 15–30 min).
- **Density register** tab: today's opening reading per tank, missing-reading warning at shift open, printable/displayable "today's density" board.
- **Tank drawer → Calibration**: paste/upload CSV chart, preview curve, validity date.
- Dip entry anywhere (stock count too) gets an optional "height" mode once a chart exists.

### 5.5 Phased plan

1. **MVP (P1):** Density Readings (receipt + opening), `@pump/shared` maths with tests, density register screen and DSSR line. No schema change to purchases.
2. **P2:** Calibration Chart JSONB + height-based dips in the existing stock count.
3. **P3:** Decantation entity linking Purchase, pre/post dips, short/excess variance, reject flow, events.
4. **P4:** Configurable tolerances per product/OMC, transit-loss claims report, Sales Officer inspection pack, water-in-tank tracking.

All ungated (compliance), per the competitor README pricing table.

### 5.6 Open questions

1. Which document is booked as stock: invoice qty (today) or measured receipt? Proposal: invoice drives the payable; measured receipt drives stock; difference is a visible Variance.
2. Do Indian OMC invoices for ROs quote quantity at 15 °C or only observed? (Varies by OMC; confirm with sample invoices from IOCL, BPCL, HPCL.)
3. Exact current tolerances: density (±3 kg/m³?), transit loss per product, settling time. Get the current MDG / OMC circular from a dealer.
4. Should ρ15 use the glass-hydrometer correction? Match the OMC booklet the dealer is given.
5. Ethanol-blended petrol (E20 is now national, PPAC 20.00% ESY 2025-26): the generalized gasoline correlation may not apply exactly; API MPMS 11.3.4 covers gasoline-ethanol blends (V via D1250 scope). Confirm what the OMCs use.
6. Terminology: retire `'Decantation'` in the `stock_movements` comment to avoid clashing with the GLOSSARY.md avoid-word.
7. Does the Attendant (mobile) ever record density, or only Manager/Owner? Default: Manager+.

## 6. Decisions (2026-10-11)

Superseding the open questions above; see ADR 0007.

- Term is **Decantation** (industry term). `GLOSSARY.md` updated.
- Invoice quantity = payable; measured quantity = stock; difference = Excess/Short Variance.
- Fuel Purchase is an Office Record (Entry Date) and never moves stock; Decantation alone adds fuel stock. Product purchases unchanged.
- PumpOS never rejects a tanker: density out of tolerance warns and flags the Decantation for Owner review.
- After-unloading dip is optional (it holds sales on the tank). Without it, the next routine Tank Dip measures the receipt; until then the Decantation is _Pending measurement_, adds no stock, and the tank shows "Waiting on decantation".
- Density method, tolerances and settling time are station settings with defaults; settling time only warns.
- Density is a register (dealer's instrument). The 15 °C calculator is an optional popup, possibly gated.
- Manager, Accountant, Owner record density and Decantations. Desktop only; mobile out of scope.
- Cost per litre updates at Decantation: invoice value ÷ received quantity.
- Out of scope for this milestone: TDS, transport/Bata, new tax reports.
