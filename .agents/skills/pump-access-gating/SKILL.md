---
name: pump-access-gating
description: Gate PumpOS features and operations on Organization access. Use when adding a mutating tenant route (each must declare its Restricted Access policy), gating a feature on a Product Capability, enforcing or reading a Limit, consuming the Access Document on the client, or explaining a CAPABILITY_NOT_ENTITLED, LIMIT_REACHED, SUBSCRIPTION_RESTRICTED or ORGANIZATION_SUSPENDED refusal.
---

# Organization access gating

Four questions decide whether a request proceeds. They are separate, they are
all enforced on the server, and conflating them is the mistake this skill
exists to prevent.

| Question | Concept | Refusal |
| --- | --- | --- |
| May this **user** do it? | Role | `FORBIDDEN` (403) |
| Has this **Organization** been given the feature? | Product Capability | `CAPABILITY_NOT_ENTITLED` (403) |
| Is there **room** under its numeric allowance? | Limit | `LIMIT_REACHED` (409) |
| May the Organization **write at all** right now? | Access mode | `SUBSCRIPTION_RESTRICTED` / `ORGANIZATION_SUSPENDED` (403) |

An Owner of an unentitled Organization is refused. A paid-up Organization at
its Station Limit is refused. The answers are independent, so check the one you
actually mean.

Canonical vocabulary lives in `CONTEXT.md`; the architecture and the business
rules settled during Phase E are in `docs/adr/0004-organization-access-control.md`
(read its **Amendments** before changing a rule — several look arbitrary until
you know why).

## The server decides, the client presents

The API re-reads access from the database on every request. A client holding a
stale Access Document gets refused the moment a grant is revoked or a grace
period lapses.

Client gates (`packages/ui/src/access/`) choose what to render and what to say.
Treat them as presentation. A capability with a client gate and no server guard
is ungated.

Absent access data means **hidden**: a cold start with no Access Document
renders nothing rather than assuming access.

## Add a mutating tenant route

Every mutating route declares whether Restricted Access permits it, because the
HTTP method cannot express the distinction: `POST /shifts/close` and
`POST /setup/stations` are both writes, and only one may continue while an
Organization is behind on payment.

1. Add a declaration to `apps/api/src/infra/write-policy-declarations.ts`, keyed
   `METHOD /prefix/path` exactly as the router registers it, with a `rationale`
   saying why.
2. Classify it. `FINISH_OPEN_WORK` for work already physically done — a sale
   made, fuel delivered, cash counted, the day closed. `BLOCKED` for growth,
   setup, invitations and premium actions.
3. Attach `writePolicyGuard('METHOD /prefix/path')` as the route's first
   middleware, before validation and before the handler's Role check.
4. Validate any body-supplied id at the edge with `validateJson`, so a missing
   id answers `VALIDATION_ERROR` rather than reaching the driver.

The per-family coverage tests in `apps/api/src/routes/*-write-policy.test.ts`
fail on a mutation with no declaration **and** on a declaration whose route lost
its guard. There is deliberately no default: "allow" lets an unpaid
Organization keep growing, "block" strands a station mid-shift.

The test that matters most when classifying: an Organization that cannot close
its open Business Day is left with stock and cash that never reconcile. Keep
the close path open.

## Gate a feature on a Product Capability

1. Register it in `PRODUCT_ACCESS_REGISTRY`
   (`packages/core/src/capabilities/organization-access/registry.ts`) **once the
   feature exists**, with its title, unavailable message and resolution code.
   The registry is code, never database rows, so configuration cannot name
   behaviour this build lacks.
2. Guard the API route with `requireCapabilityGuard('exports.tally')`.
3. Render with `CapabilityGate` (an action or section) or `CapabilityRoute` (a
   whole page, so a bookmark lands on a clear unavailable state).
4. Read state through `capabilityState(access, key)` — one decision, so a nav
   entry, a button and a route cannot disagree.

Production ships an empty capability registry: nothing is gated yet. Tests
exercise the machinery against an injected test registry, which is also the
seam a real feature uses when it lands.

## Enforce a Limit

`station_count` is the only Limit. Every Station row consumes it, inactive and
partially onboarded included — deactivation frees nothing.

Capacity is resolved under a lock on the Organization, inside the transaction
that provisions, via `ensureStationCapacity`. Both Station-creating paths take
it as a **required** dependency, so a third path cannot be added without one.
A lowered Limit blocks growth and leaves existing Stations running.

## Subscription state

Access mode is resolved at request time against `access_until`, so a Payment
Grace Period ends by the clock with no scheduled job to run or miss. Use
`resolveAccessMode(inputs, now)` rather than assembling the pieces.

Suspension is a manual security, legal, fraud or abuse stop. It lives in its
own column, outranks every billing state, and a confirmed payment leaves it
standing. Clearing it is an explicit platform command.

Unreadable input fails closed: an unrecognized Subscription Status resolves to
`RESTRICTED`, and a capability key the registry does not define is refused.

## Who sees what

The server filters the Access Document by Role before it leaves. Owners and
Managers receive the plan key and upgrade guidance; Owners, Managers and
Accountants receive billing state, because chasing an invoice is an
Accountant's job; everyone else learns only that access is limited and whom to
ask. Filtering server-side keeps commercial detail out of a client that was
never meant to hold it.

## Platform administration

Plans, grants, Limit overrides, subscription status and suspension are changed
by PumpOS platform administrators through `/platform/organizations/...` or
`packages/db/platform.mjs organization ...`. Tenants cannot grant themselves
access, and RLS denies tenant database roles any sight of the history tables.

Each command validates its key against the code registry before writing,
returns `changed: false` when the request is already satisfied, and commits its
business event in the same transaction as the change.
