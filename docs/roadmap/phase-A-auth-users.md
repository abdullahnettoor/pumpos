# Phase A — Auth, Owner Onboarding & Team Management

**Goal:** turn today's manual "create the user in Supabase by hand" process into two
first-class, self-serve flows:

1. **Owner onboarding** — a fuel-station owner is **invited to the SaaS** (invite-only,
   sales-led), sets a password, and lands in the (web-only) station onboarding wizard.
2. **Team management** — the owner (and, later, a manager) **adds org users with an
   email _or_ a phone number and sets their password directly** — no email/OTP/SMS
   required, so non-technical operators can just be handed a login + password.

This phase deliberately keeps PumpOS **invite-only** (no open self-signup) because there
is no plan/billing gating yet.

> Related: `AGENTS.md` (Authorization Rules, Multi-Tenancy), `phase-MB-mobile-owner.md`
> (light user writes), Permissions & Authorization Matrix (`docs/initial`).

---

## 1. Baseline (what exists today)

- **Auth:** Supabase JWT → API middleware ([apps/api/src/index.ts](../../apps/api/src/index.ts))
  looks up `public.users WHERE auth_user_id = jwt.sub` → resolves org/role/stations
  (60s per-isolate cache). Unmatched/`INACTIVE` → 403.
- **DB trigger (source of truth for linking):** `public.handle_new_user()`
  (`supabase/migrations/20260719000001_rls.sql`) fires `AFTER INSERT ON auth.users`:
  - **Link branch** — if `NEW.email` matches an existing `public.users` row → sets
    `auth_user_id`, `status='ACTIVE'`, role/full_name from metadata.
  - **Self-signup branch** — if no email match → **creates a new org + Owner user**
    (org name + role from `raw_user_meta_data`).
- **Team UI:** `UserRolesAssignment` inside the Organization page collects
  name/email/phone/role/stations + an "app access" toggle, but `CreateUser`
  (`packages/core/.../station-setup/users`) writes a `users` row with
  **`authUserId: null`** → **no auth account, no password, cannot log in**.
- **Login:** `packages/ui/src/components/Auth/Login.tsx` is **email + password only**.
- **API:** has **no Supabase service-role key**; no password/reset/deactivate endpoints.
- **Schema:** `users` = `authUserId, organizationId, fullName, email, phone, role
  (Owner/Manager/Accountant/Staff/Attendant), status (ACTIVE/INACTIVE)`;
  `user_station_assignments` scopes station access. `userSchema` already has `phone`.

### Verified Supabase capabilities (from current docs)
- `admin.createUser({ email|phone, password, email_confirm|phone_confirm: true })`
  creates a **verified** user and **sends nothing**. (service-role, server-side only)
- `signInWithPassword({ email | phone, password })` — login by **email _or_ phone**.
- `admin.updateUserById(id, { password })` — **direct password reset, no email/SMS**.
- `admin.updateUserById(id, { ban_duration })` — hard-disable a user immediately.
- **Native phone auth is blocked on the hosted dashboard (verified in-project).** GoTrue
  supports phone+password without OTP, but the Supabase **dashboard UI requires full Twilio
  credentials** (SID / Auth Token / Message Service SID) to save the Phone provider — even
  with “Enable phone confirmations” OFF. We will **not** configure Twilio.
- **Chosen approach: phone identity via a synthetic email handle (no provider needed).**
  Email auth is already enabled and needs zero config. For phone staff:
  - Server derives a deterministic handle from the phone, e.g. `919812345678@users.pumpos.app`,
    and calls `admin.createUser({ email: <handle>, password, email_confirm: true })` —
    **sends nothing**; account instantly usable.
  - Store the **real phone** on `users.phone`; set `users.auth_user_id` **directly** from the
    returned id (no reliance on the trigger).
  - **Login:** the field accepts “email or phone”; if the operator types a phone, the app
    converts it to the same handle before `signInWithPassword({ email: <handle> })`. To the
    operator it is just “my phone + password”.
  - Handle domain must be one we control (e.g. `users.pumpos.app`, no MX/deliverability
    needed since we never send). Phone is treated as a globally-unique login identity.

---

## 2. Key decisions (defaults — override before we build)

| # | Decision | Default |
|---|---|---|
| D1 | Owner accounts | **Invite-only**, platform-provisioned (no open self-signup) |
| D2 | Public Supabase sign-ups | **Disabled**; self-signup trigger branch **gated** by `raw_user_meta_data.signup_intent='owner'` |
| D3 | Staff identity | **Email _or_ phone** (owner picks per user). Phone is implemented as a **synthetic email handle** (native phone auth blocked by dashboard — needs Twilio). |
| D4 | Staff password | **Owner-set** for both email and phone (default). Email-invite link is **optional** (later toggle). |
| D5 | Password reset | **Admin/direct** (`updateUserById`), owner/manager sets a new one, no email/SMS |
| D6 | Who can manage users | **Owner + Manager** (Manager may add/reset **Staff+Attendant** on own stations, `canManageStaff`); Owner = full |
| D7 | Deactivate | Sets `status=INACTIVE` **and** bans the auth user (token dies immediately, not just 60s cache) |
| D8 | Phone handling | Store **normalized E.164 digits** (no `+`/spaces) on `users.phone`; auth identifier = deterministic synthetic email `<phone>@staff.<domain>`; login derives it from the typed phone |

---

## 3. Flow 1 — Owner invited to the SaaS

```text
Platform admin (you) ──invite──▶ Supabase (auth.users insert, metadata: org_name, role=Owner, signup_intent=owner)
        │
        ▼
handle_new_user() self-signup branch → creates organization + Owner users row (auth_user_id linked)
        │
        ▼
Owner opens email → sets password (Supabase-hosted) → logs in to WEB console
        │
        ▼
Web-only onboarding wizard (existing) → Organization ▸ Team
```

**Backend**
- Supabase: disable public sign-ups; gate self-signup branch behind `signup_intent='owner'`.
- Worker secret `SUPABASE_SECRET_KEY` (modern `sb_secret_...`) + `SUPABASE_URL`.
- `SupabaseAdmin` adapter (`apps/api/src/infra/supabase-admin.ts`).
- Platform route `POST /platform/owners/invite` (platform-admin allowlist, **not** tenant
  `canManageUsers`): create org + Owner row, then `inviteUserByEmail(email, { data:
  { organization_name, role: 'Owner', signup_intent: 'owner' }})`.

**UI / operator surface**
- **Phase 1:** trigger via a repo **admin script** (like `packages/db/seed.mjs`) or the
  **Supabase Dashboard → Invite user** (paste metadata JSON).
- **Phase 2:** a small **internal back-office** app/screen ("Invite owner": org name +
  email) — separate deploy, platform-staff only. Never inside the customer console.

**What the owner sees:** invite email → set password → web console → onboarding wizard.
No open signup anywhere.

---

## 4. Flow 2 — Owner adds org users (email or phone, owner sets password)

```text
Owner ▸ Organization ▸ Team ▸ "Add member"
  name + App access? ──▶ identity: (Email ⚪ | Phone ⚪) + password (owner sets) + role + station(s)
        │
        ▼ (server, service-role)
admin.createUser({ email|phone, password, email_confirm|phone_confirm: true })
        │
        ▼
CreateUser writes users row with auth_user_id linked (+ station assignments)  ── OR ──
(record-only: no App access → users row, auth_user_id NULL, never logs in)
        │
        ▼
UI shows a "credentials" card (login + password) to copy/hand over
```

Reset password: `Team ▸ row ▸ Reset password` → `admin.updateUserById(id,{password})` →
UI shows the new password to copy. Deactivate: `status=INACTIVE` + ban.

### 4a. Backend changes
- **Core** (`packages/core/.../station-setup/users/index.ts`): `CreateUser` accepts
  `password` + identity (email or phone → synthetic handle); sets `authUserId` from the
  admin-create result; add `ResetUserPassword`; emit `USER_INVITED` / `USER_PASSWORD_RESET`
  (`packages/core/src/kernel/event-catalog.ts`).
- **No trigger phone-match needed** — auth identifier is always an email (real or synthetic)
  and `auth_user_id` is set directly server-side. The `handle_new_user()` trigger only needs
  the A0 gate (self-signup branch behind `signup_intent='owner'`) for the owner-invite flow.
- **Phone ↔ handle helper** in `@pump/shared`: `normalizePhone(raw)` (E.164 digits) and
  `phoneToAuthEmail(phone)` = `<digits>@staff.<domain>` (domain from config).
- **Admin adapter** (`apps/api/src/infra/supabase-admin.ts`): `createUser`, `updateUserById`,
  `inviteUserByEmail`.
- **API routes** (`apps/api/src/routes/station-setup.ts`, service-role, role-guarded):
  - `POST /users` — provision the auth account (email→`email_confirm`, phone→`phone_confirm`,
    owner-set `password`), link `auth_user_id`, store normalized phone; record-only if no app access.
  - `POST /users/:id/reset-password` — `admin.updateUserById(id,{password})`.
  - `POST /users/:id/deactivate` / `reactivate` — status + ban/unban.
- **Permissions** (`packages/shared/src/permissions/guards.ts`): add `canManageStaff(role)`
  (Manager → Staff/Attendant only, own stations); Owner keeps full `canManageUsers`.
- **Schema** (`packages/shared/src/schemas/validation.ts`): add optional `password`; require an
  identity (email **or** phone) when app access is on; phone-normalization helper in `@pump/shared`.

### 4b. Frontend / UI changes
- **Login** (`packages/ui/src/components/Auth/Login.tsx`): single field **"Email or phone"**
  + password; detect the input and call `signInWithPassword({ email })` or `({ phone })`.
- **Team screen** (`packages/ui/src/components/StationSetup/UserRolesAssignment.tsx`):
  - Add/Edit drawer: **App access** toggle → **identity radio (Email | Phone)** → matching
    input → **password** field with **Generate** + show/**Copy**; role; station(s); status.
  - **After create → credentials card:** "Login: `<email/phone>` · Password: `<•••>`" + Copy
    (owner hands these over). (Email-invite variant would show "Invite sent".)
  - **Member list:** identity, role, **Active / Pending / Inactive** badge, station chips,
    row actions **Reset password** (mini-dialog shows new password to copy) and **Deactivate**.
- **Services** (`packages/ui/src/services/cloud.ts`): `resetUserPassword`, `deactivateUser`,
  and pass `password`/identity in `createUser`.

### 4c. What each user sees
- **Owner/Manager:** name → pick Email/Phone → set password → Create → copyable
  "login + password" card. "Reset password" any time.
- **Staff with email:** owner gives `email + password` (email-invite link optional later).
- **Staff with phone:** owner gives `phone + password`; logs in with phone + password —
  **no email, no OTP, no SMS.**

---

## 5. Permissions matrix (target)

| Capability | Owner | Manager | Accountant | Staff |
|---|---|---|---|---|
| Create user (any role) | ✅ | ❌ | ❌ | ❌ |
| Create Staff/Attendant (own stations) | ✅ | ✅ | ❌ | ❌ |
| Reset password | ✅ anyone | ✅ Staff/Attendant | ❌ | ❌ |
| Change role | ✅ | ❌ | ❌ | ❌ |
| Deactivate / reactivate | ✅ | ✅ Staff/Attendant | ❌ | ❌ |
| Invite owner (platform) | platform-admin only | — | — | — |

Guardrail: a Manager can never act on a role **≥ their own**, and is scoped to assigned
stations. All auth-account operations run **server-side with the service-role key** (never
in the client) and emit audit events; routes are rate-limited.

---

## 6. Security requirements
- Service-role key is a **Worker secret**, never shipped to any client bundle.
- All auth-account operations (create/reset/ban) are **server-only**, behind role guards.
- Disable public sign-ups; gate the self-signup trigger branch → no open Owner creation.
- Normalize + validate email (lowercase) and phone (E.164 digits) at the boundary.
- Audit via `USER_CREATED` / `USER_INVITED` / `USER_UPDATED` / `USER_PASSWORD_RESET`.
- Deactivate **bans** the auth user so tokens die immediately (not just the 60s cache).
- **Operational rule:** create the auth account **server-side** (admin API) and write the
  returned `auth_user_id` straight onto the `public.users` row in the same flow — don't rely
  on the email-match trigger for staff. (The trigger remains only for the owner-invite flow.)

---

## 7. File-by-file change list

| Area | File(s) | Change |
|---|---|---|
| Supabase config | dashboard | Disable public sign-ups (Phone provider **not** used — dashboard requires Twilio) |
| Secret | `apps/api` wrangler + `Bindings` (`src/index.ts`) + `worker-configuration.d.ts` | `SUPABASE_SECRET_KEY` (secret), `SUPABASE_URL` (var) |
| DB | `supabase/migrations/<new>.sql` | `handle_new_user()`: gate self-signup branch by `signup_intent='owner'` (A0; no phone match) |
| Admin adapter | `apps/api/src/infra/supabase-admin.ts` (new) | createUser / updateUserById / inviteUserByEmail |
| API routes | `apps/api/src/routes/station-setup.ts` | `POST /users` (provision + set auth_user_id), `/users/:id/reset-password`, `/users/:id/deactivate`; `POST /platform/owners/invite` |
| Core | `packages/core/.../station-setup/users/index.ts`, `kernel/event-catalog.ts` | password + identity in CreateUser, ResetUserPassword, new events |
| Permissions | `packages/shared/src/permissions/guards.ts` | `canManageStaff(role)` |
| Shared helpers | `packages/shared/src` | `normalizePhone`, `phoneToAuthEmail`; `userSchema` optional `password` + identity rule |
| Login UI | `packages/ui/src/components/Auth/Login.tsx` | email **or** phone + password (phone → derive handle) |
| Team UI | `packages/ui/src/components/StationSetup/UserRolesAssignment.tsx` | identity radio, password+generate/copy, credentials card, reset/deactivate, status badges |
| Services | `packages/ui/src/services/cloud.ts` | `resetUserPassword`, `deactivateUser`, password in `createUser` |
| Back-office | separate app or `packages/db/*.mjs` script | owner-invite trigger |

---

## 8. Phased plan & acceptance criteria

> **Status:** A0 + A1 **implemented** (code committed). Two manual, out-of-band
> steps remain before A1 works in an environment:
> 1. In Supabase dashboard → **disable public sign-ups** (leave the Phone provider OFF).
> 2. Config: `SUPABASE_URL` is a plaintext `[vars]` entry in `apps/api/wrangler.toml`
>    (per env — safe to commit, it's the public project URL). The **secret**
>    `SUPABASE_SECRET_KEY` (modern `sb_secret_...`) goes in `.dev.vars` for local dev and, per deployed
>    env, `wrangler secret put SUPABASE_SECRET_KEY` (add `--env preview` for the
>    preview worker). Never commit the service-role key. Redeploy the API after setting it.
> The A0 trigger change ships as `supabase/migrations/20260722000000_owner_signup_gate.sql`.

### A0 — Safety (tiny, do first) — **done**
- Disable public Supabase sign-ups; gate the self-signup trigger branch behind
  `signup_intent='owner'`; lowercase-normalize emails in `CreateUser`.
- **Done when:** a stray `auth.users` insert (no `signup_intent`) does **not** create an org.

### A1 — Team management (highest value) — **done**
- Service-role secret + `SupabaseAdmin` adapter.
- Phone→handle + phone-normalization helpers in `@pump/shared` (no DB migration needed).
- `POST /users` provisions email/phone (synthetic handle) + owner-set password, sets
  `auth_user_id` directly; `reset-password`; `deactivate`.
- `canManageStaff(role)` so **Managers** can add/reset **Staff/Attendant** on own stations.
- Team UI redesign (identity radio, password/generate/copy, credentials card, list actions).
- Login accepts email **or** phone (phone → derive handle).
- **Done when:** owner **or manager** adds a **phone** staff with a password and that staff
  logs in by typing **phone + password** on desktop/web; owner resets it; deactivate blocks
  login immediately.

### A2 — Owner provisioning
- `POST /platform/owners/invite` (platform-admin guarded) → org + Owner + `inviteUserByEmail`.
- Start via admin script; graduate to a small internal back-office app.
- Optional: email-invite link path for email staff (in addition to owner-set password).
- **Done when:** inviting an owner email provisions the org and the owner completes web
  onboarding end-to-end without any manual DB edits.

---

## 9. Confirmed decisions (ready to build)
- **D3/D8:** phone identity is implemented as a **synthetic email handle** (`<phone>@staff.<domain>`)
  because the hosted dashboard blocks native phone auth without Twilio. Operator UX is unchanged
  (log in with phone + password).
- **D4:** email staff default to **owner-set password**; email-invite is an optional later toggle.
- **D6:** **Owner + Manager** can manage users (Manager → Staff/Attendant, own stations).
- **Handle domain:** `users.pumpos.app` (placeholder; never emailed). Single source of truth is a
  shared helper + constant in `@pump/shared` — `normalizePhone(raw)` (E.164, default country **+91**),
  `phoneToAuthEmail(phone)`, `PHONE_AUTH_DOMAIN`. The handle is **never stored** — recomputed
  deterministically from `users.phone` at create/reset (backend) and login (frontend, since the
  client calls Supabase directly).

## 10. Future: migrating to a real phone provider (no user disruption)
Because the **real phone is persisted (normalized E.164) from day one**, switching to native phone
auth later is a one-time server-side batch, **not** per-user re-onboarding:
- **Path 1 (recommended):** for each phone-staff, `admin.updateUserById(id, { phone, phone_confirm: true })`
  — attaches the native phone identity to the **same** `auth.users` row → same user id, **password,
  sessions, and station assignments preserved**. Then flip login from phone→handle to native
  `signInWithPassword({ phone })`. Users notice nothing.
- **Path 2:** keep synthetic handles indefinitely (only needed to change if you want SMS/OTP features).
- **Path 3:** dual identity — add phone identity *and* keep the synthetic email (Supabase allows
  multiple identities per user).

Prerequisites we lock in A1 so this stays painless: normalized-E.164 phone storage, the single shared
handle helper (reused by the migration script), and phone-staff being inferable (`users.phone` set,
real email null). No schema change is required for the future migration.

