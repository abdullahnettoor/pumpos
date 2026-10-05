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

Status: accepted.
