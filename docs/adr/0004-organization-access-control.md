# Organization access uses plans, grants, limits, and subscription policy

PumpOS separates four access concerns that answer different questions. Roles
authorize a user, Product Capabilities name optional customer-visible behavior,
Entitlements grant an Organization capabilities beyond its Product Plan, and
Limits constrain numeric usage such as Station count. Feature Flags remain
temporary rollout controls and do not grant customer access.

Product Capability, Product Plan, and Limit definitions live in typed code
registries. The first Product Plan is `CORE`, all current product behavior is
the ungated baseline, and `CORE` limits an Organization to one Station. Optional
reports and exports use exact reusable keys such as `reports.dealer_margin` and
`exports.tally`; capabilities do not imply one another. Effective capabilities
are the union of plan capabilities and active Organization grants. Effective
Limits use an active Organization override when present, otherwise the Product
Plan value. Organization overrides can add capabilities but cannot deny plan
capabilities.

Every existing Station row consumes the phase-one `station_count` Limit,
including inactive and partially onboarded Stations. Deactivation does not free
commercial capacity. A future Station archive lifecycle may change that rule,
but it must preserve historical access. Station provisioning locks the
Organization row, resolves its effective Limit, counts Stations, and creates the
Station in one transaction so concurrent requests cannot exceed the Limit.

Organization grants and Limit overrides use separate relational history tables,
not JSONB on the Organization. Active rows are uniquely constrained by
Organization and key, revocation retains the old row, and platform mutations
emit audit events. Product Plan assignment remains on the Organization and its
event records the old and new values. PumpOS staff manage these values through
the protected platform API and CLI; tenants cannot grant themselves access.
Tenant database roles cannot read the raw history tables because they contain
commercial reasons and platform actor snapshots. Repeated platform commands are
idempotent, and every real state change commits with its outbox event in one
transaction.

Clients receive a server-computed, role-filtered Access Document through the
semi-static query cache. It contains enabled capabilities, only the disabled
upgrade options the current Role may see, effective Limit usage, and safe
subscription presentation data. It shapes navigation, route gates, messages,
and upgrade actions but never authorizes a write. The API reevaluates access for
every protected operation and reports authorization, missing Entitlement,
reached Limit, subscription restriction, and Organization suspension as
distinct errors with machine-readable resolution codes.

The Access Document uses the ten-minute semi-static cache, refreshes when the
app regains focus, and is invalidated after an access-policy rejection. Owners
and Managers may see unavailable capabilities with explanatory contact text;
Staff and Attendants do not receive disabled capability entries. Phase one does
not add an in-app upgrade request workflow. Owners and Managers may receive the
Product Plan key; other Roles do not. Persisting the Access Document requires a
client cache-version bump.

Subscription policy is independent of Entitlements. Trialing and Active allow
normal access. Past Due allows normal access through a seven-day Payment Grace
Period and warns Owners and Managers. Restricted Access then permits existing
Stations to finish essential operations but blocks new Shifts, growth, setup,
and premium work. Canceled retains normal access through `access_until` and is
evaluated as Restricted afterward. Suspension is a manual security, legal,
fraud, or abuse stop that blocks all new writes. Historical records remain
readable, and stateful capabilities must define a safe revocation boundary.

Implementation is phased. Phase one adds the registries, relational grants and
Limit overrides, `CORE` with a one-Station Limit, platform administration,
Access Document, API enforcement, useful UI gates, and audit events. Full
payment lifecycle enforcement, Restricted Access classification across all
mutations, and offline replay policy follow in phase two.
