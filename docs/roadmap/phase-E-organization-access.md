# Phase E - Organization access controls

**Goal:** let PumpOS assign optional Product Capabilities and numeric Limits to
an Organization without confusing customer access with user Roles or temporary
Feature Flags. Phase one establishes the access model and enforces the one-Station
baseline. Phase two adds payment delinquency and Restricted Access.

Architecture rationale is recorded in
`docs/adr/0004-organization-access-control.md`. Canonical terms live in
`CONTEXT.md`.

## Decisions

- Existing product behavior is the ungated baseline.
- `CORE` is the only initial Product Plan and has `station_count = 1`.
- Product Plan, Product Capability, and Limit definitions are typed code
  registries. Do not register a production capability until its feature exists.
- Optional features use exact reusable keys, for example
  `reports.dealer_margin` and `exports.tally`. Capabilities do not imply other
  capabilities.
- Effective capabilities are plan capabilities plus active Organization grants.
  Organization grants cannot deny plan capabilities.
- Effective Limits use an active Organization override when present, otherwise
  the Product Plan value.
- Grants and Limit overrides use relational history tables, not Organization
  JSONB. Revocation closes an active row; regranting inserts a new row.
- PumpOS platform administrators manage plans, grants, and Limit overrides.
  Tenant users cannot grant access.
- Roles still decide which users may perform an entitled action.
- The API is authoritative. Client access data only controls presentation.

## Phase E1 - Access foundation

### Typed domain registry

Add an `organization-access` capability under `packages/core` with no Hono,
Drizzle, or React dependencies.

Define:

- `ProductPlanKey`, initially `CORE`.
- `ProductCapabilityKey`; production contains only implemented gated features.
- `LimitKey`, initially `station_count`.
- Product Plan definitions with capability sets and Limit values.
- Capability presentation metadata: title, default unavailable message, and
  whether Owners and Managers may see an upgrade entry.
- Resolution codes: `CONTACT_PUMPOS`, `COMPLETE_PAYMENT`,
  `CONTACT_OWNER_OR_MANAGER`, `REDUCE_USAGE`, and `WAIT_FOR_REACTIVATION`.
- Stable errors: `CAPABILITY_NOT_ENTITLED`, `LIMIT_REACHED`,
  `SUBSCRIPTION_RESTRICTED`, and `ORGANIZATION_SUSPENDED`. Existing `FORBIDDEN`
  remains the Role authorization error.

Core ports load active Organization grants, active Limit overrides, Product Plan,
subscription data, and Limit usage. Domain functions compute effective access
and a role-filtered Access Document. They must not query the database directly.

### Database schema

Normalize `organizations.subscription_plan` to typed `CORE` and
`subscription_status` to uppercase values:

```text
TRIALING | ACTIVE | PAST_DUE | RESTRICTED | CANCELED | SUSPENDED
```

Migration mapping for current values:

```text
Active       -> ACTIVE
Deactivated  -> SUSPENDED
Revoked      -> SUSPENDED
```

Add nullable `organizations.access_until`. Phase E1 returns these values but
does not implement delinquency restrictions or status mutation commands.

Add `organization_capability_grants`:

```text
id UUID PK
organization_id UUID NOT NULL FK
capability_key VARCHAR NOT NULL
granted_by_subject VARCHAR NULL
granted_by_email VARCHAR NOT NULL
reason VARCHAR NULL
created_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ NULL
revoked_by_subject VARCHAR NULL
revoked_by_email VARCHAR NULL
```

Add `organization_limit_overrides`:

```text
id UUID PK
organization_id UUID NOT NULL FK
limit_key VARCHAR NOT NULL
value INTEGER NOT NULL CHECK value > 0
assigned_by_subject VARCHAR NULL
assigned_by_email VARCHAR NOT NULL
reason VARCHAR NULL
created_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ NULL
revoked_by_subject VARCHAR NULL
revoked_by_email VARCHAR NULL
```

Both tables require an `organization_id` index and a partial unique index on
Organization plus key where `revoked_at IS NULL`. RLS denies tenant roles all
direct access; only the platform service path reads or mutates these rows.
Manual Limit overrides require a reason; capability grant, revocation, and
plan-change reasons are optional. Platform actor fields are snapshots, not
foreign keys to tenant `users`; they match the platform event actor's email and
optional authentication subject.

Tenant database roles cannot select these raw tables. They contain platform
actor snapshots, reasons, and commercial history that clients do not need.
Tenant applications receive only the effective, role-filtered Access Document.

### Access API

Add authenticated `GET /access`. It returns a server-computed Access Document:

```ts
type AccessDocument = {
  plan?: 'CORE';
  capabilities: Record<
    string,
    {
      enabled: boolean;
      visibility: 'HIDDEN' | 'UPGRADE';
      title: string;
      unavailableMessage?: string;
      resolution?: string;
    }
  >;
  limits: {
    station_count: { value: number; used: number; reached: boolean };
  };
  subscription: {
    status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'CANCELED' | 'SUSPENDED';
    mode: 'NORMAL' | 'RESTRICTED' | 'SUSPENDED';
    accessUntil: string | null;
    showWarning: boolean;
    warningMessage: string | null;
  };
};
```

The exact TypeScript contract belongs in shared types. The server filters it by
Role: Owners and Managers may receive disabled upgrade entries; Staff and
Attendants receive enabled entries only. Owners and Managers may receive the
Product Plan key; Staff and Attendants do not. Do not return unimplemented
registry entries or future roadmap capabilities.

### Client integration

Add centralized `queryKeys.access()` and a shared `useAccess` hook. Treat access
as semi-static: stale after ten minutes, persisted for resilience, refreshed when
the app regains focus, and invalidated after an access-policy rejection. Use the
last cached document during a network outage. On a cold start without access
data, hide optional capabilities rather than granting them.

Add the access key to the persisted semi-static prefixes and bump
`CACHE_BUSTER` in the same release. Persist only the Access Document, never raw
grant rows, reasons, or platform actor data.

Provide small shared selectors or gates for navigation, routes, and actions.
They should answer whether an entry is enabled, hidden, or shown with an upgrade
message. They do not authorize requests. A bookmarked unavailable route renders
a clear unavailable-capability state instead of a generic permission error.

Use explanatory text only in E1. Owners and Managers may see that they should
contact PumpOS. Staff and Attendants do not see pricing or upgrade prompts.

### Platform administration

Extend the protected platform API and `packages/db/platform.mjs` CLI with:

```text
organization access show <organization-id>
organization plan set <organization-id> CORE
organization capability grant <organization-id> <capability-key>
organization capability revoke <organization-id> <capability-key>
organization limit set <organization-id> station_count <value>
organization limit clear <organization-id> station_count
```

UUID is the authoritative Organization argument. Existing list/search output
helps operators find it. Reject unknown registry keys before writing. Regranting
after revocation inserts a new row.

Commands are idempotent. Granting an already-active capability or clearing an
absent override returns success with `changed: false`, writes no row, and emits
no event. Changing an active Limit override revokes the old row and inserts the
new row in one transaction. It never edits the historical value in place.

Emit:

```text
ORGANIZATION_PLAN_CHANGED
ORGANIZATION_CAPABILITY_GRANTED
ORGANIZATION_CAPABILITY_REVOKED
ORGANIZATION_LIMIT_OVERRIDE_SET
ORGANIZATION_LIMIT_OVERRIDE_CLEARED
ORGANIZATION_SUBSCRIPTION_STATUS_CHANGED
```

Events include the platform actor, Organization, old and new values, and the
optional or required reason. A rejected request emits no business event.
Every real platform state change and its event append commit through
`runInTransaction`; access state must never change without its audit event.

### Station Limit enforcement

Every existing Station row consumes `station_count`, including inactive and
partially onboarded Stations. Deactivation does not free capacity. A future
Station archive lifecycle may change this only while preserving historical
access.

Station onboarding finalization does not currently use `runInTransaction`.
Refactor its route wiring and `DrizzleOnboardingProvisioner` dependencies so the
following steps use the same transaction client and transactional event
dispatcher:

1. Lock the Organization row with `SELECT ... FOR UPDATE`.
2. Resolve the effective `station_count` Limit.
3. Count the Organization's Station rows.
4. Return `LIMIT_REACHED` with HTTP 409 when usage has reached the Limit.
5. Otherwise provision the Station and append existing events atomically.

The Organization UI shows `used of limit Stations used` to Owners and Managers.
When reached, disable or hide the onboarding action and explain that the current
plan includes one Station. Role authorization still applies before Limit
presentation. The API guard remains mandatory for bookmarks, stale clients,
retries, and concurrent requests.

### Error contract

Keep the standard response envelope. Access failures include a stable code,
plain message, and structured details:

```json
{
  "success": false,
  "error": {
    "code": "CAPABILITY_NOT_ENTITLED",
    "message": "Tally export is not available for this Organization.",
    "details": {
      "capability": "exports.tally",
      "resolution": "CONTACT_PUMPOS",
      "actionLabel": "Contact PumpOS"
    }
  }
}
```

Use HTTP 403 for Role, Entitlement, restriction, and suspension failures. Use
HTTP 409 for reached Limits. UI copy must explain the resolution without
exposing billing details to Staff or Attendants.

### Required verification

- Unit-test Product Plan resolution, additive active grants, revoked grants,
  Limit replacement, invalid keys, and role-filtered Access Documents.
- Repository-test grant, revoke, regrant, active-row uniqueness, Limit override,
  Limit replacement history, idempotent no-op commands, and denial of tenant
  reads from raw access tables.
- API-test platform-only mutation access and structured error responses.
- Verify the first Station succeeds, the second returns `LIMIT_REACHED`, an
  override permits it, and concurrent onboarding cannot exceed the Limit.
- UI-test hidden Staff and Attendant entries, Owner and Manager upgrade states,
  Station usage messaging, bookmarked route gating, and invalidation after an
  access-policy error.
- Verify every successful platform mutation appends its business event.
- Verify state and event writes roll back together on failure.
- Do not implement or test Tally export in this phase.

## Phase E2 - Subscription enforcement

Implement subscription mutation commands and provider integration after E1.

- `PAST_DUE` retains normal access for seven days through `access_until` and
  shows persistent warnings to Owners and Managers.
- `CANCELED` retains normal access through its paid `access_until`; request-time
  evaluation becomes Restricted afterward without depending on a scheduled job.
- `RESTRICTED` allows existing Stations to finish essential work in an open
  Business Day, including sales, readings, financial entries, stock operations,
  handover, Shift close, and Business Day close. It blocks opening a new Shift,
  onboarding, setup changes, invitations, premium actions, and integrations.
- `SUSPENDED` is a manual security, legal, fraud, or abuse stop. It blocks all
  new writes and offline replay while preserving appropriate historical reads.
- Offline replay uses the same request-time policy as live writes. It does not
  trust a client timestamp to bypass current access policy. There is no write
  outbox yet, so nothing replays today; the obligation is carried in
  `docs/roadmap/phase-O-offline-sync.md` (O2) and in the doc comments on
  `evaluateWritePolicy` and `writePolicyGuard`, which is where replay will be
  judged when it exists.
- Payment confirmation restores `ACTIVE` immediately and invalidates access
  data. Existing usage above a downgraded Limit remains operational, but growth
  is blocked until usage is below the effective Limit.
- All users see that operations are Restricted, but only Owners and Managers see
  payment details and resolution actions.

Before implementing E2, classify every mutating endpoint as allowed or blocked
under Restricted Access and test that matrix. Do not infer this policy from the
HTTP method alone.

## Out of scope

- Station-scoped Entitlements.
- Capability deny overrides.
- Capability inheritance.
- Expiring grants or temporary trials.
- Database-editable Product Plans or capability definitions.
- Percentage rollout or experimentation Feature Flags.
- In-app upgrade requests or billing checkout.
- Tally export or custom report implementation.
- Automatically deactivating Stations after a plan downgrade.
