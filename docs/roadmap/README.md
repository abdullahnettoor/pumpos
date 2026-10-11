# PumpOS Roadmap Archive and Phase Index

These files preserve phase plans and design context. Their status text can lag the
code: **GitHub Issues are the source of truth for current task status**, and code,
configuration, `AGENTS.md`, `GLOSSARY.md`, and accepted ADRs are authoritative for
shipped behavior. Verify a phase's remaining work before acting on it.

## Phase documents

The phase documents are design and implementation history, grouped by theme. Their
status labels, suggested sequences, and “remaining” checklists are not current project
status. Before taking work from one, check the linked/current GitHub Issues and verify
the relevant code/configuration.

| Phase | Theme                                  | Document                                                       |
| ----- | -------------------------------------- | -------------------------------------------------------------- |
| L     | Ledger / money visibility              | [phase-L-ledger.md](phase-L-ledger.md)                         |
| U     | UI consistency                         | [phase-U-ui-uplift.md](phase-U-ui-uplift.md)                   |
| F     | Financial accounts, P&L, COGS, OMC/CMS | [phase-F-financials.md](phase-F-financials.md)                 |
| R     | Reports and PDF                        | [phase-R-reports-pdf.md](phase-R-reports-pdf.md)               |
| P     | Performance and caching                | [phase-P-performance.md](phase-P-performance.md)               |
| T     | Tax and GST                            | [phase-T-tax.md](phase-T-tax.md)                               |
| U2    | Unit-aware fuels                       | [phase-U2-fuel-units.md](phase-U2-fuel-units.md)               |
| M     | Marketing, console, mobile topology    | [phase-M-multisite.md](phase-M-multisite.md)                   |
| MB    | Mobile workflows                       | [phase-MB-mobile-owner.md](phase-MB-mobile-owner.md)           |
| D     | Data pagination                        | [phase-D-data-pagination.md](phase-D-data-pagination.md)       |
| A     | Authentication and team                | [phase-A-auth-users.md](phase-A-auth-users.md)                 |
| O     | Resilience and sync                    | [phase-O-offline-sync.md](phase-O-offline-sync.md)             |
| HR    | Historical replay                      | [phase-HR-historical-replay.md](phase-HR-historical-replay.md) |
| X     | Expansion                              | [phase-X-expansion.md](phase-X-expansion.md)                   |

## Principles

- Forecourt Sales use Business Day + Shift; Office Records use Entry Date; purchases are Business-Day stock events (ADR 0005).
- Snapshots immutable; reports derive from snapshots/events/operational records.
- Multi-tenant: every table has `organization_id`, RLS mandatory.
- Extend entities; never duplicate validation; UI: list → drawer → edit.
