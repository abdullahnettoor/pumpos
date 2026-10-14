# Research: what Indian OMCs call the daily sales/stock report of a retail outlet

Date: 2026-10-14. Research only. Nothing else in the repo was changed; this file is not committed.

## Question

What do Indian oil marketing companies (OMCs), their dealers, and dealer software call the daily sales/stock report of a retail outlet (RO)? Is "DSR" the industry term, and should PumpOS rename "DSSR" to "DSR"?

## Summary

- The primary OMC documents (IOCL and HPCL Marketing Discipline Guidelines, 2012 editions) never use "DSR" or "DSSR". They name a **"Daily sales register"** (of the OMC) and a **"daily stock-register"** (provided by the company).
- "DSR" appears only in secondary dealer-support material, where it expands to "Daily Sales Report" (or "Daily Sales Register" in the page slug). Confidence in "DSR" as a dealer term: medium. Confidence in it as an OMC term: low.
- I could not reach BPCL, Nayara, Jio-bp or Shell India primary sources, nor PESO, Legal Metrology, or any dealer-software vendor site. These gaps are listed below.
- "DSR" is ambiguous. Its expansion depends on the source, and the regulatory name for the sales book is "Daily Sales Register" while the stock book is a separate "daily stock register".
- Recommendation (detail below): do not rename on the grounds of "industry usage" alone. If the owner wants dealer-recognisable wording, use "Daily Sales Register (DSR)" as the expansion, and keep the stock section explicitly named.

## Per-OMC table

| OMC                             | Term                                                                     | Expansion                                  | Source URL                                                                                                              | Quote                                                                                                                                                                                                              | Confidence                                                   |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| IOCL (Indian Oil)               | "Daily sales register" (OMC) and "daily stock-register"                  | Daily sales register; daily stock register | https://www.iocl.com/uploads/MDG_11jan2013.pdf (MDG 2012, extracted text)                                               | §5.1.12: "i. Daily sales register of OMC & Density register for current and previous financial years." §1.3(ii): "Dealer to maintain a daily stock-register provided by the company for all petroleum products."   | High (primary, but 2012 edition; 2022 amendment not checked) |
| IOCL (Indian Oil), abbreviation | No "DSR" or "DSSR" found in MDG                                          | n/a                                        | same                                                                                                                    | n/a                                                                                                                                                                                                                | High that the official text does not use DSR                 |
| BPCL (Bharat Petroleum)         | Not found                                                                | n/a                                        | bpcl.com / bharatpetroleum.com not reachable (HTTP 000)                                                                 | n/a                                                                                                                                                                                                                | None                                                         |
| HPCL (Hindustan Petroleum)      | "Daily sales register" and "daily stock-register" (same wording as IOCL) | Daily sales register; daily stock register | https://www.hindustanpetroleum.com/documents/pdf/Retail_Marketing_Discipline_Guidelines_(MDG)_2012.pdf (extracted text) | §5.1.12 (i): "Daily sales register of OMC & Density register for current and previous financial years." §1.3 (ii): "Dealer to maintain a daily stock-register provided by the company for all petroleum products." | High (primary, 2012 edition)                                 |
| Nayara Energy                   | Not found                                                                | n/a                                        | https://www.nayaraenergy.com returns HTTP 403; /retail returns 403                                                      | n/a                                                                                                                                                                                                                | None                                                         |
| Jio-bp                          | Not found                                                                | n/a                                        | https://www.jio-bp.com returns a 114-byte placeholder; https://www.jiobp.com was reachable but has no matching term     | n/a                                                                                                                                                                                                                | None                                                         |
| Shell India                     | Not found                                                                | n/a                                        | https://www.shell.in/motorists/ reachable but no matching term                                                          | n/a                                                                                                                                                                                                                | None                                                         |

Dealer-facing secondary evidence (not OMC-issued):

| Source                                                    | Term                       | Quote                                                                                                                                                                                                                                     | Confidence                      |
| --------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| petrolpumpdealershub.in (dealer-support site, not an OMC) | "DSR"                      | https://petrolpumpdealershub.in/for-existing-dealers/ : "Maintain daily records like DSR and Density Register."                                                                                                                           | Low to medium (supporting only) |
| petrolpumpdealershub.in MDG support page                  | "Daily Sales Report (DSR)" | https://petrolpumpdealershub.in/for-existing-dealers/daily-sales-register-dsr/ : "Record Maintenance: Daily Sales Report (DSR), Density Register, Complaint Register, Test Records…" (note: the URL slug says "daily-sales-register-dsr") | Low (supporting only)           |

## Regulatory / MDG registers

Primary MDG text (IOCL and HPCL 2012 editions, nearly identical wording):

- **Daily sales register of OMC**: §5.1.12 "Non-maintenance of specified records". The text says non-maintenance "will be treated as an irregularity". Sources: IOCL MDG PDF; HPCL MDG PDF.
- **Daily stock-register "provided by the company" for all petroleum products**: §1.3(ii). Also §1.3(b): "Dealer to maintain record of water dip on daily basis which will form a part of the daily stock register." Sources: IOCL MDG; HPCL MDG.
- **Density register / Density record**: IOCL Annexure 1 is titled "DENSITY RECORD" (fields: Tank No., Product, Month, Date, Morning density, Tank truck receipt). HPCL has "Annexure 1 – Density Record" (line 203 of extracted text). Source: IOCL MDG; HPCL MDG.
- **Stock verification / shrinkage**: IOCL Annexure 9 "Method for allowing shrinkage allowance in stock verification": Opening dip (A) + receipts (B) − shrinkage (C) − sales per meter (E) = closing book (F), compared with closing dip (G), tolerance "+/- 4 % of G". Source: IOCL MDG extracted text, page 64.
- **Pump meter reading and daily stock display**: §1.5(i) "maintaining stock / sales & density records, display of daily stock, price board etc."

Government context:

- MoPNG lists "Marketing Discipline Guidelines (MDG), 2012 for RO dealership / SKO dealership" as a download (https://mopng.gov.in/en/marketing/retail-outlets). I did not extract the PDF text from this page; the IOCL and HPCL copies were used.
- PIB (14 Mar 2022, PRID=1805737) describes MDG for RO dealerships but names no register. https://pib.gov.in/Pressreleaseshare.aspx?PRID=1805737
- PESO: https://www.peso.gov.in/ redirects to http://www.peso.gov.in/web/ and returned no content (HTTP 000 on the redirect target). **Not checked.**
- Legal Metrology: legalmetrology.gov.in unreachable (HTTP 000). **Not checked.**
- State VAT/GST practice for fuel dealers: **not checked** (no reachable source).

## Software vendors table

| Vendor                         | Term used for daily report | Expansion | Source URL                                                     | Quote | Confidence |
| ------------------------------ | -------------------------- | --------- | -------------------------------------------------------------- | ----- | ---------- |
| FuelOS                         | Not verified               | n/a       | https://fuelos.com/ returns a lander page (no content)         | n/a   | None       |
| PetroManager                   | Not verified               | n/a       | https://petromanager.com/ returns a lander page                | n/a   | None       |
| Fuel360                        | Not verified               | n/a       | https://fuel360.com/ returns a lander page                     | n/a   | None       |
| Pumpkart                       | Not verified               | n/a       | pumpkart.com / pumpkart.in unreachable                         | n/a   | None       |
| PetroSoft India                | Not verified               | n/a       | petrosoft.in / petrosoftindia.com unreachable                  | n/a   | None       |
| Tally add-ons for petrol pumps | Not searched               | n/a       | search endpoints (DDG, Bing, Mojeek) blocked or returned noise | n/a   | None       |

No vendor evidence was obtained. Search engines were blocked (DuckDuckGo returned a bot challenge; Mojeek and Bing returned errors or noise), and the vendor domains I guessed are parked or unreachable. A future pass should use a working search tool or the vendors' own site search.

## Ambiguity of "DSR"

- In OMC primary text (IOCL and HPCL MDG), the term is spelled out: "Daily sales register" and "daily stock-register". The abbreviation "DSR" does not occur.
- In dealer-support material, "DSR" expands as "Daily Sales Report" on one page and as "Daily Sales Register" in the page slug. Both are used by the same site.
- "DSR" is not used for a stock register in any source I found. The stock book is named in full ("daily stock-register"), so an expansion "Daily Stock Register" for DSR is unsupported.
- The meaning that dominates in the sources I could read is "daily sales register/report" (sales-side). Because the MDG names the sales book as an OMC-prescribed record, "Daily Sales Register" is the closest regulatory match.
- PumpOS's own documents disagree about content. The AGENTS.md domain text describes the DSSR as "Sales-only", while the owner's brief describes it as including tank stock movement (opening, receipts, sales, closing, variance). Under the OMC split, sales go in the sales register and stock in the stock register, so a single "DSR" label covering both is at odds with the MDG structure.

## Recommendation

1. Do not rename on the basis that "DSR" is the industry term. The primary OMC documents do not use it. It is a dealer-side shorthand, and its expansion varies.
2. If dealer recognisability is the goal, use **"Daily Sales Register (DSR)"** as the user-facing name. That matches the MDG wording "Daily sales register of OMC" and gives the dealer's own term.
3. Because the report also covers tank stock, either name the stock section "Daily stock register" (MDG wording) inside the report, or rename the whole document "Daily Sales & Stock Report (DSSR)" to match the content. Keeping "DSSR" is defensible if the stock section stays; no source found uses "DSSR".
4. Before committing to the rename, verify two things: (a) the 2022/2024 MDG amendments (the IOCL page snippet mentions "Amended on 30.11.2022" and a Scribd copy of a 2024 MDG exists), since I only read the 2012 editions; and (b) BPCL, Nayara, Jio-bp and Shell primary documents, which were not reachable.

Confidence in this recommendation: medium. It rests on two primary PDFs (2012 editions) and one dealer-support site. It does not cover BPCL, Nayara, Jio-bp, Shell, PESO, Legal Metrology, or dealer software.

## Sources

Primary (read):

- IOCL MDG 2012 (extracted text): https://www.iocl.com/uploads/MDG_11jan2013.pdf
- HPCL MDG 2012 (extracted text): https://www.hindustanpetroleum.com/documents/pdf/Retail_Marketing_Discipline_Guidelines_(MDG)_2012.pdf
- MoPNG retail-outlets listing (MDG 2012 download link): https://mopng.gov.in/en/marketing/retail-outlets
- PIB, MDG formulated by OMCs (14 Mar 2022): https://pib.gov.in/Pressreleaseshare.aspx?PRID=1805737

Secondary (supporting only):

- Dealer-support site, "For existing dealers": https://petrolpumpdealershub.in/for-existing-dealers/
- Dealer-support site, MDG support page (slug "daily-sales-register-dsr"): https://petrolpumpdealershub.in/for-existing-dealers/daily-sales-register-dsr/
- IOCL MDG landing page, search-result snippet only (page returned a redirect): https://www.iocl.com/marketing-discipline-guidelines

Unreachable or not checked:

- bpcl.com, bharatpetroleum.com, bharatpetroleum.co.in, bpclretail.in (HTTP 000)
- nayaraenergy.com (HTTP 403)
- jio-bp.com (placeholder), jiobp.com (no matching term)
- shell.in (no matching term)
- peso.gov.in (redirect, no content), legalmetrology.gov.in (HTTP 000)
- fuelos.com, petromanager.com, fuel360.com (lander pages), pumpkart.com/.in, petrosoft.in, petrosoftindia.com, fuel360.co.in (unreachable)
- sdms.indianoil.in (HTTP 200 but 83-byte body, no content)
- DuckDuckGo, Bing, Mojeek search endpoints (blocked or noise)
