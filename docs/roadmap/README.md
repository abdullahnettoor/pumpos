# PumpOS Roadmap

Detailed implementation plans for the post-MVP phases. Each phase is independently
shippable and extends existing domain entities (per `AGENTS.md`) rather than redesigning core.

## Phase index
| Phase | Theme | Status | Depends on |
|---|---|---|---|
| [L](phase-L-ledger.md) | Ledger / money visibility | ✅ Done | R (PDF export reuse) |
| [U](phase-U-ui-uplift.md) | UI uplift & consistency | ✅ Done | — |
| [F](phase-F-financials.md) | Financials — money accounts + P&L/COGS + Other Income + CMS/OMC | 🟡 Mostly done | L |
| [R](phase-R-reports-pdf.md) | Reports & PDF hardening | 🟡 Mostly done (R4 server PDF pending) | — |
| [P](phase-P-performance.md) | Performance & caching | 🟡 Mostly done | — |
| [T](phase-T-tax.md) | Product tax restructure & GST invoicing | 🟡 Mostly done (T5 breakup pending) | R, L |
| [U2](phase-U2-fuel-units.md) | Unit-aware fuels (kg / L, e.g. CNG) | 🟡 Mostly done (QA pass pending) | — |
| [M](phase-M-multisite.md) | Multi-site topology (marketing + console + mobile) | 🟡 Code done; deploy/ops remain | — |
| [MB](phase-MB-mobile-owner.md) | Mobile owner app (owner-first PWA) | 🟡 Partial (attendant handover done) | M, R (R4), F, L |
| [D](phase-D-data-pagination.md) | Data access & pagination | ⬜ Planned (not started) | P (complementary) |
| [O](phase-O-offline-sync.md) | Offline & sync (desktop) | ⬜ Foundations only (idempotency + outbox) | — |
| [X](phase-X-expansion.md) | Expansion modules | ⬜ Future (X4 prepaid/OMC partly seeded) | core stable |

Recently shipped (this line supersedes the old sequence): **Customer Sales** in the
handover (Credit / Fleet / Regular receivables + inline customer/vehicle create),
customer **settlement cycle** (EOD/OPEN) with an EOD-due dashboard chip + day-close
warning, and the **OMC fleet-card → CMS** flow (new `CMS` money account, OMC sales
posting money-in to CMS with per-line traceability, supplier pay-from-CMS), plus
mobile handover parity and per-line idempotency keys. These span Phase F/L and seed X4.

## Suggested sequence
**Done:** L, U, and the bulk of F (FA money accounts → FB P&L/COGS → FI Other Income →
CMS/OMC), P, T, M, U2. **Remaining priority order:** F finish (Void UI for
Expenses/Income, FI4 GST-on-income) → R4 (server-side PDF) → D (pagination) →
T5 (DSSR tax breakup) → MB owner cockpit → O (offline). X is future.
Phase M's remaining work is deployment/ops (Cloudflare domains, Supabase Auth URLs,
icons), independent of the domain-model phases.

## Principles
- `business_day_id` universal anchor; `shift_id` only when cash drawer involved.
- Snapshots immutable; reports derive from snapshots/events/operational records.
- Multi-tenant: every table has `organization_id`, RLS mandatory.
- Extend entities; never duplicate validation; UI: list → drawer → edit.
