# PumpOS Roadmap

Detailed implementation plans for the post-MVP phases. Each phase is independently
shippable and extends existing domain entities (per `AGENTS.md`) rather than redesigning core.

## Phase index
| Phase | Theme | Status | Depends on |
|---|---|---|---|
| [R](phase-R-reports-pdf.md) | Reports & PDF hardening | In progress | — |
| [P](phase-P-performance.md) | Performance & caching | Planned (instrumentation done) | — |
| [D](phase-D-data-pagination.md) | Data access & pagination | Planned | P (complementary) |
| [L](phase-L-ledger.md) | Ledger / money visibility | Planned | R (PDF export reuse) |
| [T](phase-T-tax.md) | Product tax restructure & GST invoicing | Planned | R, L |
| [F](phase-F-financials.md) | Financials / P&L / COGS | Planned | L |
| [U](phase-U-ui-uplift.md) | UI uplift & consistency | Planned | — |
| [O](phase-O-offline-sync.md) | Offline & sync (desktop) | Future | — |
| [X](phase-X-expansion.md) | Expansion modules | Future | core stable |

## Suggested sequence
R (finish) → L → T → F1–F2 → U → O → X. R and U can run in parallel with L.

## Principles
- `business_day_id` universal anchor; `shift_id` only when cash drawer involved.
- Snapshots immutable; reports derive from snapshots/events/operational records.
- Multi-tenant: every table has `organization_id`, RLS mandatory.
- Extend entities; never duplicate validation; UI: list → drawer → edit.
