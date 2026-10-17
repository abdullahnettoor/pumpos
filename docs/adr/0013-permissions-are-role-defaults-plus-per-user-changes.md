# Permissions are Role defaults plus per-user changes

Status: accepted, implemented (#550; decided 2026-10-13).

Owners want to give or take away individual abilities for one user without
inventing new roles. We decided that a user's **Permissions** are their Role's
**Default Permissions** plus per-user changes made by the Owner. The changes
are stored as **differences** from the Role ("+ void expense, − view profit
and loss"), never as a full copy. So a Permission added in a later release
follows the Role's default for everyone who hasn't changed it, and changing a
user's Role resets their changes (with a warning). Custom roles may come
later on the same model.

## Considered options

- **Custom roles only.** Rejected for now: Owners mostly need "this one person
  needs one more thing", and named roles make that a two-step task.
- **Full permission lists per user.** Rejected: every new Permission would
  need a data backfill, and users would silently miss new defaults.

## Consequences

- Every check asks "does this user have this Permission?", not "is this the
  Owner?". The server resolves the effective Permissions on each request; the
  apps only use them to show or hide menus.
- Only the Owner changes Permissions. Some are never delegable: subscription,
  organization settings, managing Owners, the activity log, deactivating the
  Organization. The Attendant Role stays mobile-only and handover-only.
  Rules about _whose_ data a user acts on stay fixed per Role (own handover;
  Managers manage only Staff and Attendants).
- Permissions apply at every Station the user is assigned to. Station
  assignment stays separate.
- Customising Permissions is a Product Capability. Without it, or after a
  downgrade, the changes are kept but ignored and everyone uses Role defaults.
- When this ships, mobile tabs follow Permissions too, superseding the fixed
  table in ADR 0011.
