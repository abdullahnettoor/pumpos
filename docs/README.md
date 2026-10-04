# Documentation map

Use these sources in this order when they disagree:

1. [`../AGENTS.md`](../AGENTS.md) — hard engineering, domain, security, and
   operational rules.
2. [`../CONTEXT.md`](../CONTEXT.md) — canonical domain language.
3. [`adr/`](adr/) — accepted decisions and amendments.
4. Current code, schema, and configuration — implementation truth. The database
   source is `packages/db/src/schema.ts` plus `packages/db/migrations/`.
5. [`v2/`](v2/) — maintained engineering patterns; verify details against the
   implementation because some pages are still being refreshed.

## Reference material

- [`USER-FLOW.md`](USER-FLOW.md) — operator walkthrough; verify screen labels and
  screenshots against the current application before using it as a test script.
- [`PUMP-ERP-DESIGN-SYSTEM.md`](PUMP-ERP-DESIGN-SYSTEM.md) and the root
  [`DESIGN.md`](../DESIGN.md) — product design language and tokens.
- [`DATA-CACHING.md`](DATA-CACHING.md) — current client caching practice.
- [`roadmap/`](roadmap/) — phase plans and design context. GitHub Issues track
  active task status; roadmap status notes are snapshots, not live state.
- [`research/`](research/) — dated market and compliance research, not product
  requirements.
- [`release-notes/`](release-notes/) — shipped release summaries.
- [`archive/initial-v1/`](archive/initial-v1/) — superseded original proposals;
  historical traceability only, never implementation guidance.

## Operations

- [`API-HYPERDRIVE-DEPLOYMENT.md`](API-HYPERDRIVE-DEPLOYMENT.md) — local API and
  Hyperdrive setup.
- [`desktop-updates.md`](desktop-updates.md) — desktop updater behavior and
  troubleshooting.
- [`rollback-runbook.md`](rollback-runbook.md) — production rollback decisions.
- Root [`RELEASING.md`](../RELEASING.md) — release and deployment process.
