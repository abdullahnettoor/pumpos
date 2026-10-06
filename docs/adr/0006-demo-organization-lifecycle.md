# Demo organizations are explicitly disposable

Demo organizations are operationally indistinguishable from customer
organizations while they exist, except for the platform-managed `is_demo` marker
and expiry instant. The marker is the authorization boundary for demo lifecycle
operations: only rows explicitly marked as demos can be reset or hard-deleted.
Every API request remains platform-admin-only, and demo endpoints are disabled
unless the deployment explicitly sets `ALLOW_DEMO_ORGS=true`.

Ordinary PumpOS business data is retained for audit and reporting, so normal
organization lifecycle must not use physical deletion. Demo organizations are
the narrow exception: they contain synthetic, disposable prospect data with no
real operational or accounting authority. Expired demos are deactivated at
expiry and permanently removed after seven days; a platform administrator may
delete one earlier after the confirmation step.

`ALLOW_DEMO_ORGS` is configured only on the preview Worker. Production refuses
the demo routes even while production and preview share a database. Once
production has its own database, the same explicit-off default preserves the
boundary without application code changes.

Reset and delete lock the organization row (`SELECT … FOR UPDATE`) and re-check
`is_demo` inside the transaction; the final delete also filters on
`is_demo = true`. Because a hard delete removes the organization's own `events`,
the record of each create, reset, extend, expiry and delete is a structured
Worker log line (`[platform-demo] DEMO_ORGANIZATION_*`), not an organization
event. Demo organizations skip billing and Limits: the access reader treats them
as ACTIVE with no paid-through date and lifts every Limit; suspension still
applies, which is how expiry cuts access.

Demo history is written through the core use-cases (open shift, handover, close
shift, close business day, purchase, credit sale, office records, stock count)
with a fixed clock per day, so snapshots, ledger entries and events have the
shapes the app writes.

Status: accepted.
