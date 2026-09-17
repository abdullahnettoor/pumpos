# Releasing and deployment

PumpOS releases through one reviewed action: merge `dev` into `main`. The
release workflow waits for production approval, then derives the version, tags
the merge commit, publishes the GitHub Release, deploys production, and builds
desktop installers.

- `git push origin dev` → **preview** deploy to `*.abdullahnettoor.com` for only
  the apps/packages that changed.
- merge `dev` into `main` → one `vX.Y.Z` release for web, API, and desktop.
- **Actions → Deploy → Run workflow** → targeted **preview** deploy (manual,
  pick an app).

Workflows: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (web),
[`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)
(desktop), [`.github/workflows/migrate.yml`](.github/workflows/migrate.yml) (DB).

> **A release went wrong?** → **[Rollback runbook](docs/rollback-runbook.md)**.
> Read its first section before touching anything: whether a code rollback is
> safe depends entirely on whether a migration has already run.

Two guardrails sit on the production path:

- The release gate uses the `production` GitHub Environment, which has a
  **required reviewer**. No tag, GitHub Release, desktop installer, or production
  deployment exists until a human approves the release.
- Every deploy ends with a **smoke check** ([`scripts/smoke-deploy.mjs`](scripts/smoke-deploy.mjs))
  that asserts the surface actually answers. Upload success is not health.

## Trigger matrix

| Trigger                           | What deploys                                                  | Target                                           |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Open / push to a **pull request** | Only the frontends that PR changes                            | Per-PR `*.workers.dev` URL, posted on the PR     |
| `git push origin dev`             | Only changed web/API apps (path-filtered)                     | Preview custom domains (`*.abdullahnettoor.com`) |
| `workflow_dispatch` on **Deploy** | Selected app (`all`, `console`, `marketing`, `mobile`, `api`) | Preview custom domains                           |
| Merge `dev` into `main`           | Web/API production and desktop installers                     | `*.pumpos.app` and the GitHub Release            |
| Push to any non-`dev` branch      | Nothing                                                       | No CI deploy                                     |

### Pull-request previews

Every PR gets its own Worker per frontend it touches, named `pr-<n>-pumpos-<app>`,
on a `workers.dev` URL posted as a sticky comment on the PR. Two PRs in flight no
longer overwrite each other. The Workers are deleted when the PR closes.

Previews use a route-free [`wrangler.pr.toml`](apps/console/wrangler.pr.toml) per
app, so a preview can never claim a production hostname. The API is deliberately
excluded — a per-PR API Worker would need its own Hyperdrive binding and Supabase
secrets, so PR previews talk to the shared preview API instead.

Path-filter behavior on `dev`:

```text
apps/api, packages/core, packages/db, packages/shared → API preview
apps/console, packages/ui, packages/shared            → console preview
apps/mobile, packages/ui, packages/shared             → mobile preview
apps/marketing                                        → marketing preview
package-lock.json or deploy.yml                       → affected deploy jobs
```

---

## Cut a release

**You do not pick or commit the version.** Open a PR from `dev` into `main` and
merge it after CI passes. [`release.yml`](.github/workflows/release.yml) waits
for production approval, derives the next version from commits since the latest
release tag, tags the merge commit, publishes the GitHub Release, and starts
production deployment and desktop builds.

If the repository has no `vX.Y.Z` tags, the first release is `v1.0.0`. After
that, every version increments from the latest release tag.

The bump is read off commit subjects (Conventional Commits):

| Commit                                              | Bump  |
| --------------------------------------------------- | ----- |
| `feat!:` … or `BREAKING CHANGE:` in the body        | major |
| `feat:`                                             | minor |
| `fix:` / `perf:`                                    | patch |
| `docs:` `ci:` `test:` `chore:` `style:` `refactor:` | patch |

Every merge to `main` is an intentional production promotion, so a change set
without `feat`, `fix`, or `perf` still receives a patch version.

Check what any change set would produce, at any time:

```bash
node scripts/next-version.mjs                    # current -> bump -> version
node scripts/next-version.mjs --range v1.0.8..HEAD
```

`node scripts/release.mjs X.Y.Z` is an internal build-stamping command. Release
workflows call it in disposable runners. It does not commit, tag, or push.

> Cost note: every release builds desktop installers. Desktop CI uses macOS
> (**10×** minutes) and Windows (**2×**) runners.

---

## Guardrails on the production path

These live in **repository settings**, not in this repo, so they are recorded
here — settings have no diff and no review.

### The production approval gate

The first release job declares `environment: production`. That declaration only
does something if the environment exists **and** carries a protection rule:

- **Settings → Environments → `production` → Required reviewers** — at least one
  person. Without this the declaration is decoration and a merge to `main`
  releases to live fuel stations unattended.

Verified by observation rather than by reading the setting: a job claiming the
`production` environment parks in `waiting` with a pending deployment until a
named reviewer approves.

### Branch protection

`main` and `dev` both require a pull request and these three status checks:

```text
verify      typecheck + tests + builds   (ci.yml)
lint        Prettier + ESLint ratchet    (ci.yml)
marketing   standalone install + build   (ci.yml)
```

Force pushes and deletions are off; conversation resolution is required. Set via
the API, so to re-apply after a settings mishap:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "verify" }, { "context": "lint" }, { "context": "marketing" }]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

---

## One-time setup checklist

### Now (to make releases work)

- [ ] Repo secret `CLOUDFLARE_API_TOKEN` (permission: **Edit Cloudflare Workers**).
- [ ] Repo secret `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Repo → Settings → Actions → **Workflow permissions** = _Read and write_
      (the release workflow creates a GitHub Release). The workflow also requests it
      explicitly, but this is the backup.
- [ ] **Disconnect** the old Cloudflare-managed console build (Workers & Pages →
      console project → Settings → Builds) so it doesn't double-deploy.
- [ ] Commit `package-lock.json` if it ever changes (CI uses `npm ci`).

### Optional now (explicit dev config; otherwise baked-in fallbacks are used)

- [ ] `DEV_SUPABASE_URL`, `DEV_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Repo variable `PREVIEW_API_URL=https://api.pumpos.abdullahnettoor.com`
      (optional; this is the default).
- [ ] Smoke-check targets, all optional — the defaults match the wrangler
      configs: `CONSOLE_URL`, `MOBILE_URL`, `MARKETING_SITE`,
      `PREVIEW_CONSOLE_URL`, `PREVIEW_MOBILE_URL`, `PREVIEW_MARKETING_SITE`.
- [ ] **workers.dev enabled** on the Cloudflare account — per-PR previews get
      their URL from it (`pr-<n>-pumpos-<app>.<subdomain>.workers.dev`).

---

## Production / preview environments

Wrangler config is now consistent:

- top-level `wrangler deploy` = production (`*.pumpos.app`)
- `wrangler deploy --env preview` = preview (`*.abdullahnettoor.com`)

Preview routes:

```text
pumpos.abdullahnettoor.com
console.pumpos.abdullahnettoor.com
m.pumpos.abdullahnettoor.com
api.pumpos.abdullahnettoor.com
```

Production routes:

```text
pumpos.app
console.pumpos.app
m.pumpos.app
api.pumpos.app
```

### Supabase auth

The API prefers Supabase's newer asymmetric JWT verification (`ES256` via JWKS).
`SUPABASE_JWT_SECRET` is no longer required. It is only an optional fallback if a
Supabase project still issues legacy `HS256` tokens.

To confirm the new path, inspect a token header; it should include:

```json
{ "alg": "ES256", "kid": "..." }
```

### API CORS

The API no longer uses `origin: '*'`. It allowlists production, preview, local,
and known Tauri origins:

```text
https://pumpos.app
https://console.pumpos.app
https://m.pumpos.app
https://pumpos.abdullahnettoor.com
https://console.pumpos.abdullahnettoor.com
https://m.pumpos.abdullahnettoor.com
localhost / 127.0.0.1 ports: 1420, 3000, 3100, 4321, 5173
tauri://localhost
http(s)://tauri.localhost
```

If Tauri production reports a different browser origin, add it to the allowlist
in [`apps/api/src/index.ts`](apps/api/src/index.ts).

### To isolate prod data from preview/dev

- [x] Create the production Supabase project.
- [x] Run **migrate** workflow → target `prod` (needs secret
      `PROD_DIRECT_DATABASE_URL`, the direct 5432 URL — not the pooler).
- [x] Apply RLS/policy SQL (`supabase/migrations/*.sql`) to prod.
- [ ] `wrangler hyperdrive create pumpos-prod --connection-string "<prod direct URL>"`.
- [ ] Replace the top-level Hyperdrive id in
      [`apps/api/wrangler.toml`](apps/api/wrangler.toml) with the prod id.
- [x] Repo secrets: `PROD_SUPABASE_URL`, `PROD_SUPABASE_PUBLISHABLE_KEY`,
      `PROD_API_URL`.
- [ ] Supabase Auth → add production and preview hosts to Site URL + Redirect URLs.

If you want to use the preview/dev Supabase from production for initial testing,
leave the top-level API Hyperdrive id pointing at the preview/dev database and
set `PROD_SUPABASE_URL` / `PROD_SUPABASE_PUBLISHABLE_KEY` to that same project.
That is valid for launch testing, but prod and preview will share data.

---

## TODO — when the `pumpos.app` domain is live

Hosts are config-driven; only the wrangler route strings are hard edits.

- [ ] Repo variables: `MARKETING_SITE=https://pumpos.app`,
      `CONSOLE_URL=https://console.pumpos.app`.
- [x] Top-level `pattern` in frontend wrangler configs → `*.pumpos.app`.
- [x] API top-level route → `api.pumpos.app`.
- [ ] Supabase Auth → add `pumpos.app` and `*.abdullahnettoor.com` preview hosts
      to Site URL + Redirect URLs.
- [ ] `pumpos.app` active as a Cloudflare zone (routes auto-provision DNS + cert).

---

## TODO — R2 public downloads (deferred: needs a paid R2 / payment details)

Private-repo GitHub Release assets aren't publicly downloadable, so before the
repo goes private, move installer distribution to Cloudflare R2. The workflow
steps already exist and are **skipped until `R2_BUCKET` is set**.

- [ ] Create an R2 bucket + public access (custom domain e.g.
      `downloads.pumpos.app`, or the `r2.dev` URL).
- [ ] Add a **CORS** rule allowing `GET` from the marketing origin.
- [ ] Ensure `CLOUDFLARE_API_TOKEN` includes **R2 read/write**.
- [ ] Repo variables: `R2_BUCKET`, `R2_PUBLIC_BASE`,
      `DOWNLOAD_MANIFEST_URL=<R2_PUBLIC_BASE>/downloads/manifest.json`.

Then every release uploads installers + refreshes the public manifest the
download page reads. (While the repo is **public**, GitHub Release assets are
already publicly downloadable, so R2 isn't urgent.)

---

## TODO — desktop signing & auto-updater (deferred)

Current builds are **unsigned** → users see "unverified publisher" / Gatekeeper
warnings.

- [ ] macOS: Apple Developer ($99/yr) → set `APPLE_*` secrets for signing +
      notarization.
- [ ] Windows: code-signing cert.
- [ ] Auto-updater (free Tauri keypair, separate from OS signing):
  - [ ] `npx @tauri-apps/cli signer generate -w ~/.tauri/pumpos.key`.
  - [ ] Add the **public** key to `tauri.conf.json` → `plugins.updater.pubkey` + an updater endpoint.
  - [ ] Repo secrets `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`).

---

## Database migrations

Never run on deploy. Trigger manually: **Actions → DB migrate → Run workflow**,
choose `dev` or `prod`. Needs `DEV_DIRECT_DATABASE_URL` /
`PROD_DIRECT_DATABASE_URL` secrets. Flow for a schema change: generate + commit
migration → migrate `dev` → verify → migrate `prod` → then release.
