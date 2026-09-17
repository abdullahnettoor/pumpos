# Rollback runbook

**When you need this, you are already having a bad evening.** A release went to
production and stations cannot work. This page is the whole procedure.

It assumes nothing except repo access and the Cloudflare dashboard. If any step
here needs knowledge that is not written down, that is a bug in this page —
fix it while you still remember.

---

## First: decide whether a code rollback is even safe

**Read this before touching anything.** Migrations in PumpOS are deliberately
manual and are applied **before** the code that needs them
([`migrate.yml`](../.github/workflows/migrate.yml)). That ordering is what makes
most rollbacks safe — and it is also the thing that can make one catastrophic.

Ask one question: **did this release require a migration that has already run?**

```bash
# What shipped in the bad release?
git log --oneline v<previous>..v<bad>
# Did any of it touch the schema?
git diff --name-only v<previous>..v<bad> -- supabase/migrations packages/db
```

| Situation                                                                                                                                             | Safe to roll back code?                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| No migration in this release                                                                                                                          | **Yes.** Go to "Roll back the Workers".                                        |
| Migration ran, and it was **additive** (new nullable column, new table, new index)                                                                    | **Yes.** Old code ignores what it does not know about. Leave the schema alone. |
| Migration ran, and it was **destructive or narrowing** (dropped/renamed a column, tightened a constraint, changed a type, backfilled over old values) | **No — read the next section.**                                                |

Additive vs destructive is the whole judgement. If you are unsure, treat it as
destructive.

### When the migration makes a code rollback unsafe

Rolling the code back puts the **old** application on the **new** schema. If the
migration removed or narrowed something the old code still writes to, the old
code will fail — or worse, write data the new schema silently mangles. In a
ledger, that is not an outage, it is a correctness incident.

Do **not** "just roll back the database". A down-migration on a production
ledger destroys the rows written since the deploy, which are real shift closes
and real collections.

Instead, in order of preference:

1. **Fix forward.** Ship a small corrective release. This is almost always the
   right answer, and it is why the smoke checks and the approval gate exist —
   to make the next deploy fast and safe rather than to make rollback good.
2. **Roll back code _and_ apply a compensating migration** that restores what
   the old code needs, written as a new forward migration. Never by reverting
   the old one.
3. **Take the affected surface down deliberately** (see "Emergency stop") if
   staying up is doing damage. A station that knows it is down can use paper. A
   station silently recording wrong numbers cannot.

Whatever you choose, say so in the incident channel before you do it.

---

## Roll back the Workers

Each surface is an independent Cloudflare Worker, so they roll back
independently. Prefer the Cloudflare rollback — it re-serves a known-good build
without waiting for CI.

| Surface   | Worker name        | URL                        |
| --------- | ------------------ | -------------------------- |
| Marketing | `pumpos-marketing` | https://pumpos.app         |
| Console   | `pumpos-console`   | https://console.pumpos.app |
| Mobile    | `pumpos-mobile`    | https://m.pumpos.app       |
| API       | `pumpos-api-prod`  | https://api.pumpos.app     |

### Option A — Cloudflare instant rollback (fastest, do this first)

```bash
# List recent versions; note the ID of the last good one.
npx wrangler versions list  --name pumpos-api-prod
npx wrangler rollback       --name pumpos-api-prod
# …or target a specific version:
npx wrangler versions deploy <version-id>@100% --name pumpos-api-prod --yes
```

Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your environment
(same values as the repo secrets). The dashboard equivalent is
**Workers & Pages → _worker_ → Deployments → … → Rollback**.

Roll back **the API last and restore it first** if you are doing several: the
shells degrade more gracefully against a working API than the reverse.

After each rollback, prove it:

```bash
node scripts/smoke-deploy.mjs api https://api.pumpos.app
node scripts/smoke-deploy.mjs console https://console.pumpos.app
node scripts/smoke-deploy.mjs mobile https://m.pumpos.app
node scripts/smoke-deploy.mjs marketing https://pumpos.app
```

### Option B — revert through the release flow

Slower (a full build) but it makes the repo and production agree, which
Option A does not.

1. **Actions → Release → Run workflow** is _not_ what you want. A rerun retries
   the current release; it does not roll code back.
2. Revert the bad merge from `main` and let the normal path create a new release:

```bash
git checkout main && git pull
git switch -c revert/v<bad> origin/main
git revert -m 1 <merge-commit-of-the-bad-release>
git push -u origin revert/v<bad>
```

Open this branch as a PR into `main`, then sync `main` back into `dev`. The
release workflow ships the previous code as a **new, higher version**. That is
deliberate. See the next section for why you must not reuse the old number.

The release will **pause for approval before creating the new tag** because the
`production` environment has a required reviewer. Approve it. That pause is not
in your way; it is the thing that stops a panicked second mistake.

### Emergency stop (when serving nothing beats serving wrong)

```bash
npx wrangler delete --name pumpos-console      # removes the Worker + its routes
```

Destructive and needs a full redeploy to undo. Reach for it only when the
release is actively corrupting data. Prefer rollback.

---

## The release tag and the GitHub Release

The bad version is tagged and published. Leave both in place.

**Do not delete the tag, and do not reuse the version number.** Cloudflare,
desktop installers and any operator who noted the version all refer to it.
Deleting it makes the incident harder to reconstruct, and re-cutting `v1.0.8`
with different content means two builds share one name forever.

Do this instead:

```bash
# Mark it clearly so nobody installs it from the releases page.
gh release edit v<bad> --prerelease \
  --notes "WITHDRAWN — regression in <what broke>. Superseded by v<next>. Do not install."
```

If the release carried **desktop installers**, this matters more because people
may have downloaded them. The superseding release rebuilds both web and desktop
artifacts automatically.

---

## After the fire is out

- [ ] The superseding release is deployed and its smoke checks passed.
- [ ] The withdrawn release is marked, with a note saying what broke.
- [ ] If a migration was involved, write down whether it was additive or
      destructive and what you did — that judgement is the expensive part.
- [ ] Add whatever check would have caught this. A rollback you had to perform
      by hand is a missing test.

---

## Related

- [RELEASING.md](../RELEASING.md) — how a release is cut in the first place
- [`deploy.yml`](../.github/workflows/deploy.yml) — deploy + smoke checks
- [`migrate.yml`](../.github/workflows/migrate.yml) — manual DB migrations
- [`scripts/smoke-deploy.mjs`](../scripts/smoke-deploy.mjs) — the health assertions
