# Releasing & Deployment

How PumpOS ships. Production is **tag-driven**; the `dev` branch deploys to the
custom preview domains.

- `git tag vX.Y.Z` (via `npm run release`) → **production** deploy of web/API.
- `git push origin dev` → **preview** deploy to `*.abdullahnettoor.com` for only
      the apps/packages that changed.
- `git tag desktop-vX.Y.Z` → desktop installers on a GitHub Release.
- **Actions → Deploy → Run workflow** → targeted **preview** deploy (manual,
      pick an app).

Workflows: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (web),
[`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)
(desktop), [`.github/workflows/migrate.yml`](.github/workflows/migrate.yml) (DB).

## Trigger matrix

| Trigger | What deploys | Target |
|---|---|---|
| `git push origin dev` | Only changed web/API apps (path-filtered) | Preview custom domains (`*.abdullahnettoor.com`) |
| `workflow_dispatch` on **Deploy** | Selected app (`all`, `console`, `marketing`, `mobile`, `api`) | Preview custom domains |
| `vX.Y.Z` tag | Web/API production | `*.pumpos.app` |
| `desktop-vX.Y.Z` tag | Desktop installers only | Draft GitHub Release |
| Push to any non-`dev` branch | Nothing | No CI deploy |

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

```bash
# 1. Commit any pending work (the release script requires a clean tree)
git add -A && git commit -m "…"

# 2. Bump the unified version everywhere + create the web/API release tag
npm run release -- patch      # 1.0.1 -> 1.0.2   (or: minor | major | 1.5.0)
#   updates all package.json + tauri.conf.json + Cargo.toml, commits, tags

# 3. Push the tag → triggers prod web/API deploy
git push --follow-tags

# 4. Optional: build desktop installers only when you intentionally need them
git tag -a desktop-v1.0.2 -m "PumpOS desktop v1.0.2"
git push origin desktop-v1.0.2
```

Preview a bump without writing anything: `npm run release -- patch --dry`.

> Cost note: desktop CI uses macOS (**10×** minutes) + Windows (**2×**) runners.
> It only runs on `desktop-v*.*.*` tags now, not normal `v*.*.*` releases.

---

## One-time setup checklist

### Now (to make releases work)
- [ ] Repo secret `CLOUDFLARE_API_TOKEN` (permission: **Edit Cloudflare Workers**).
- [ ] Repo secret `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Repo → Settings → Actions → **Workflow permissions** = *Read and write*
      (desktop release creates a GitHub Release). The workflow also requests it
      explicitly, but this is the backup.
- [ ] **Disconnect** the old Cloudflare-managed console build (Workers & Pages →
      console project → Settings → Builds) so it doesn't double-deploy.
- [ ] Commit `package-lock.json` if it ever changes (CI uses `npm ci`).

### Optional now (explicit dev config; otherwise baked-in fallbacks are used)
- [ ] `DEV_SUPABASE_URL`, `DEV_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Repo variable `PREVIEW_API_URL=https://api.pumpos.abdullahnettoor.com`
      (optional; this is the default).

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

Then every tagged release uploads installers + refreshes the public manifest the
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
  - [ ] Add the **public** key to `tauri.conf.json` → `plugins.updater.pubkey`
        + an updater endpoint.
  - [ ] Repo secrets `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`).

---

## Database migrations

Never run on deploy. Trigger manually: **Actions → DB migrate → Run workflow**,
choose `dev` or `prod`. Needs `DEV_DIRECT_DATABASE_URL` /
`PROD_DIRECT_DATABASE_URL` secrets. Flow for a schema change: generate + commit
migration → migrate `dev` → verify → migrate `prod` → then release.
