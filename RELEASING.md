# Releasing & Deployment

How PumpOS ships. Everything is **tag-driven** — plain branch pushes never build,
so syncing WIP between machines is free.

- `git tag vX.Y.Z` (via `npm run release`) → **production** deploy of all web
  apps **+** desktop installers on a GitHub Release.
- **Actions → Deploy → Run workflow** → **preview** deploy to `workers.dev`
  (manual, pick an app).

Workflows: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (web),
[`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml)
(desktop), [`.github/workflows/migrate.yml`](.github/workflows/migrate.yml) (DB).

---

## Cut a release

```bash
# 1. Commit any pending work (the release script requires a clean tree)
git add -A && git commit -m "…"

# 2. Bump the unified version everywhere + create the tag
npm run release -- patch      # 1.0.1 -> 1.0.2   (or: minor | major | 1.5.0)
#   updates all package.json + tauri.conf.json + Cargo.toml, commits, tags

# 3. Push the tag → triggers prod web deploy + desktop build/release
git push --follow-tags
```

Preview a bump without writing anything: `npm run release -- patch --dry`.

> Cost note: desktop CI uses macOS (**10×** minutes) + Windows (**2×**) runners.
> Only tag when you actually want a release — don't iterate on tags.

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

---

## TODO — when a separate PROD Supabase exists

Goal: isolate prod data from the current (dev) Supabase.

- [x] Create the production Supabase project.
- [x] Run **migrate** workflow → target `prod` (needs secret
      `PROD_DIRECT_DATABASE_URL`, the direct 5432 URL — not the pooler).
- [x] Apply RLS/policy SQL (`supabase/migrations/*.sql`) to prod.
- [x] `wrangler hyperdrive create pumpos-prod --connection-string "<prod direct URL>"`.
- [x] Uncomment `[env.production]` in
      [`apps/api/wrangler.toml`](apps/api/wrangler.toml); paste the Hyperdrive id.
- [x] `wrangler secret put SUPABASE_JWT_SECRET --env production`.
- [x] Repo secrets: `PROD_SUPABASE_URL`, `PROD_SUPABASE_PUBLISHABLE_KEY`,
      `PROD_API_URL`.
- [x] Repo variable `API_DEPLOY_ENV=production` (tag deploys then hit the prod
      API worker).

Until this is done, a tag deploys to the **current** Supabase + API and the
frontend build logs a warning — that's expected.

---

## TODO — when the `pumpos.app` domain is live

Hosts are config-driven; only the wrangler route strings are hard edits.

- [ ] Repo variables: `MARKETING_SITE=https://pumpos.app`,
      `CONSOLE_URL=https://console.pumpos.app`.
- [ ] Edit top-level `pattern` in
      [`apps/console/wrangler.toml`](apps/console/wrangler.toml),
      [`apps/marketing/wrangler.toml`](apps/marketing/wrangler.toml),
      [`apps/mobile/wrangler.toml`](apps/mobile/wrangler.toml) →
      `console.pumpos.app` / `pumpos.app` / `m.pumpos.app`.
- [ ] API `[env.production]` route → `api.pumpos.app`.
- [ ] Supabase Auth → add `pumpos.app` hosts to Site URL + Redirect URLs.
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
