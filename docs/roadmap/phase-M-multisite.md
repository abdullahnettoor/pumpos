# Phase M — Multi-site topology (marketing + console + mobile)

**Goal:** split PumpOS's web presence into three purpose-built surfaces so each
one can be optimized independently: an SEO-first marketing/downloads site on
the apex, the full operational SPA on `console.`, and a lightweight owner PWA
on `m.`. The current `apps/web` is single-purpose (SPA) and served on the
apex, which conflates marketing SEO, operational depth, and mobile suitability.

Nothing about the domain model, API surface, or database schema changes in this
phase.

---

## Target topology

| Surface     | Dev host                                | Prod host                     | Purpose |
|-------------|-----------------------------------------|-------------------------------|---------|
| Marketing   | `pumpos.abdullahnettoor.com`            | `pumpos.app`                  | Landing, downloads, (later) docs/blog. Static, SEO-first. |
| Console     | `console.pumpos.abdullahnettoor.com`    | `console.pumpos.app`          | Current `apps/web` — full operational SPA. Desktop browsers only. |
| Mobile      | `m.pumpos.abdullahnettoor.com`          | `m.pumpos.app`                | Owner-focused PWA — read-mostly. |
| API         | `pumpos-api.abdullahnettoor.workers.dev` (unchanged) → later `api.pumpos.app` | `api.pumpos.app` | Hono on Workers. |

All three sites deploy as Cloudflare **Workers with Static Assets** (matches
`apps/web` today; keeps the deploy model uniform).

Auth is a single Supabase project; cookies scoped to `.pumpos.app` so console
and mobile share the session.

---

## Deployment (CI/CD)

**Tag-driven releases.** Web surfaces deploy from `.github/workflows/deploy.yml`;
the desktop app from `.github/workflows/desktop-release.yml`. Plain branch pushes
never build — so syncing WIP between machines costs no CI minutes.

- **`git tag vX.Y.Z` + push** → production release: all web apps deploy to their
  top-level (custom-domain) config; desktop builds macOS + Windows installers
  and attaches them to a **draft GitHub Release**.
- **Actions → Deploy → Run** (`workflow_dispatch`, pick an app) → **preview**
  deploy to workers.dev (`--env preview`). Manual, on demand.
- Cut releases with **`npm run release -- patch|minor|major|X.Y.Z`** — one
  unified version bumps every workspace `package.json` + `tauri.conf.json` +
  `Cargo.toml`, commits, and creates the tag. Then `git push --follow-tags`.
- The **API** job builds workspace deps (`npm run build:api`) before
  `wrangler deploy` — wrangler bundles `apps/api` from source and needs
  `@pump/{db,core,shared}/dist`.

### GitHub Actions minute cost (Free plan, private repo = 2,000 min/mo)
- Web jobs run on Linux (**1×**) and are short. Tag-only triggering keeps usage
  low.
- Desktop runners are billed at **macOS 10× / Windows 2×**, so desktop CI is
  **tag-only** (never on push). Rust build cache (`Swatinem/rust-cache`) trims
  repeat-build time. A release ≈ a few hundred billed minutes, mostly macOS.

### Environment isolation (dev vs prod Supabase)

One codebase, config selected at build time:

| | Preview (manual run) | Production (tag) |
|---|---|---|
| Frontends | `dev-pumpos-*` (workers.dev) | top-level custom domains |
| Supabase | dev (via `DEV_*` or fallback) | `PROD_*` if set, else current (warns) |
| API worker | `pumpos-api` (top-level) | top-level, or `--env $API_DEPLOY_ENV` |

- **Frontend** Supabase URL + publishable key + API URL are injected from repo
  secrets: `PROD_*` on tags, `DEV_*` on manual runs. Injection is **soft** —
  an unset var falls back to the app's baked-in default (`X || default`), so it
  works today with the single current Supabase; a warning fires on tags until
  `PROD_*` is set.
- **API** prod: `apps/api/wrangler.toml` has a commented `[env.production]`
  scaffold (prod route + Hyperdrive + JWT secret). Once live, set the repo
  variable `API_DEPLOY_ENV=production` and the tag deploy targets the prod
  worker; until then it deploys the current top-level worker.
- Secrets live in **repository** secrets (Environment secrets need Pro/Team on
  private repos), namespaced `PROD_*` / `DEV_*`.

### Database migrations

Migrations never run on deploy. A separate **manually-triggered** workflow
(`.github/workflows/migrate.yml`, `workflow_dispatch`) applies drizzle-kit
migrations to a chosen target (`dev` or `prod`) using
`DEV_DIRECT_DATABASE_URL` / `PROD_DIRECT_DATABASE_URL` secrets (direct
connection on 5432, not the transaction pooler). Flow for a schema change:
generate + commit migration → run migrate (dev) → verify → run migrate (prod)
→ deploy API. RLS/policy SQL in `supabase/migrations/*.sql` is applied
separately (supabase CLI / direct scripts).

### Go-live domain switch (abdullahnettoor.com → pumpos.app)

Hostnames are config-driven, so switching to the real prod domain is mostly
setting variables — no code edits except the wrangler route strings (which
can't read env vars):

1. **Repo variables:** `MARKETING_SITE=https://pumpos.app`,
   `CONSOLE_URL=https://console.pumpos.app` (marketing links + sitemap flip on
   the next tag build).
2. **Repo secrets:** `PROD_SUPABASE_URL`, `PROD_SUPABASE_PUBLISHABLE_KEY`,
   `PROD_API_URL=https://api.pumpos.app` (frontends inject these on tag builds;
   until set, they fall back to the current Supabase/API and warn).
3. **Wrangler routes (the only code edit):** update the top-level `pattern` in
   `apps/{console,marketing,mobile}/wrangler.toml` → `console.pumpos.app` /
   `pumpos.app` / `m.pumpos.app`; uncomment `apps/api` `[env.production]` +
   prod Hyperdrive id; set variable `API_DEPLOY_ENV=production`.
4. **Supabase Auth:** add the `pumpos.app` hosts to Site URL + Redirect URLs.
5. **Zone:** `pumpos.app` active in the Cloudflare account (routes then
   auto-provision DNS + certs on the next tag deploy).

The console's `resolveApiUrl` and marketing links carry current-domain
defaults, so nothing breaks before the switch and there are no dead links in
dev.

---

## Repository layout after this phase

```
apps/
  api/          (unchanged)
  desktop/      (unchanged — Tauri wraps apps/web's UI)
  web/          → rename to `console` (mechanical): apps/console
  marketing/    NEW — Astro + MDX + Tailwind, Worker static assets
  mobile/       NEW — Vite + React PWA, Worker static assets
packages/
  ui/           (unchanged, shared by console + desktop + mobile)
  shared/       (unchanged)
  core/         (unchanged)
  db/           (unchanged)
```

We do **not** create a `packages/mobile-ui` up front. Mobile reuses `@pump/ui`
primitives; only if divergence proves justified do we split.

---

## M1 — Domain split + mobile gate (foundation)

Ships a clean topology with zero new features. Everything else builds on this.

**Status: implemented (code).** Remaining M1 items are Cloudflare-dashboard /
Supabase steps that can't be done from the repo — see "Manual steps" below.

### M1.a — Rename `apps/web` → `apps/console` ✅
- `mv apps/web apps/console`; update workspace globs in root `package.json`,
  `tsconfig.json`, and any `wrangler.toml` references.
- Rename Worker: `pumpos-web` → `pumpos-console`; `dev-pumpos` → `dev-pumpos-console`.
- Update deploy scripts and `VITE_API_URL` bake-in to reflect the new name.

### M1.b — Route console under `console.` subdomain
- Add a Cloudflare Route: `console.pumpos.abdullahnettoor.com/*` → `dev-pumpos-console` Worker.
- Update `resolveApiUrl()` in `apps/console/src/App.tsx` to match new hostnames
  (`console.pumpos.abdullahnettoor.com`, later `console.pumpos.app`).
- Update Supabase Auth **Site URL** and **Redirect URLs** to include the new
  console hostnames (and remove the old apex once marketing is up).

### M1.c — Edge mobile gate on console Worker
Add a tiny fetch handler in front of static assets that:
1. Reads `Sec-CH-UA-Mobile` (preferred) and falls back to a UA regex.
2. On mobile → `302` to `https://m.<same-zone>/` **without downloading the SPA**.
3. Emits `Vary: Sec-CH-UA-Mobile, User-Agent` to keep CDN caching correct.
4. Bypass with `?desktop=1` cookie for on-device debugging.

Acceptance:
- Curl with a mobile UA → `302` to `m.…`.
- Curl with a desktop UA → SPA shell served, no redirect, cache hits.

### M1.d — In-app fallback gate
Belt + braces: `AppShell` renders a "PumpOS console isn't supported on this
device — open on desktop or visit `m.<domain>`" splash when
`window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches`.
Used for edge cases the UA gate misses (tablets in desktop-mode, etc.).

**Exit criteria:** `console.pumpos.abdullahnettoor.com` serves the SPA on
desktop, redirects on mobile. Old `pumpos.abdullahnettoor.com` route freed for
Phase M2.

### Manual steps (not doable from the repo)
These must be done in the Cloudflare dashboard / Supabase once, then a deploy
activates the split:
1. **Deploy** the console: `npm run deploy --workspace=apps/console` (prod, uses
   the `console.pumpos.abdullahnettoor.com` custom-domain route) or
   `npm run deploy:dev --workspace=apps/console` (preview → workers.dev).
2. **DNS / custom domain:** the top-level `[[routes]] custom_domain = true` in
   `apps/console/wrangler.toml` provisions the `console.pumpos.abdullahnettoor.com`
   hostname on the first prod deploy — Cloudflare creates the proxied DNS record
   and issues the edge TLS cert automatically (zone `abdullahnettoor.com` must
   already be active in the same account — it is). No manual DNS entry needed.
   Verify after deploy under **Workers & Pages → pumpos-console → Settings →
   Domains & Routes** (status `Active`); cert issuance can take a few minutes.
   If the domain is already claimed by another Worker/Pages project, remove that
   binding first or the deploy will fail.
3. **Supabase Auth:** add `https://console.pumpos.abdullahnettoor.com` (and later
   `https://console.pumpos.app`) to **Site URL** + **Redirect URLs**; remove the
   bare apex once M2 marketing takes it over.
4. **Mobile host:** the edge redirect targets `m.<zone>`, which only exists after
   Phase M3. Until then, mobile visitors on the custom domain hit the in-app
   gate's "open mobile app" link (harmless dead link) — or use `?desktop=1`.

### What shipped in code
- `apps/web` → `apps/console` (git-tracked rename); workspace globs, root
  scripts (`dev:console`, `deploy:console`, `build:ui-console`), `tsconfig.json`
  project ref, Tailwind `@source`, and `download-fonts.mjs` targets updated.
- Worker renamed `pumpos-web` → `pumpos-console` (`dev-pumpos` →
  `dev-pumpos-console`); custom-domain route added; preview pinned to
  workers.dev via `routes = []`.
- Edge mobile gate: `apps/console/worker/index.ts` runs before static assets
  (`run_worker_first`), 302s mobile UAs to `m.<zone>`, honors `?desktop=1`.
- In-app fallback: `apps/console/src/MobileBlock.tsx` +
  `useIsUnsupportedMobile()` gate at the top of `App`.
- Hostname/API resolution in `App.tsx` updated to the new console hosts.

---

## M2 — Marketing site (`apps/marketing`)

**Status: implemented (code).** Landing, download, legal, sitemap and robots all
build to static HTML. Remaining: real OG raster image, analytics beacon, and the
Cloudflare custom-domain deploy (manual, same pattern as M1).

### Stack
- **Astro 4+** (static output, SSR possible via Workers if needed later).
- **MDX** for content (landing sections, and later docs/blog).
- **Tailwind** matching PumpOS design tokens (share `@pump/ui/tokens.css`
  where sensible — no runtime coupling).
- **Astro Content Collections** scaffolded for `blog/` and `docs/` even though
  we won't publish any yet.

### Scope for v1
- `/` landing page: hero, tagline ("The operating system for fuel retail"),
  problem → solution → features → screenshots → CTA (Download / Talk to us).
- `/download`: OS-detected primary CTA (auto-detects Win/Mac/Linux),
  cards for each installer, a "Version manifest" JSON contract defined but
  wired to placeholder URLs.
- `/legal/privacy`, `/legal/terms`: static MDX stubs.
- `sitemap.xml`, `robots.txt`, OG images per route (Astro's built-in tools).
- Analytics: Cloudflare Web Analytics beacon (no cookies, no consent banner).

### Download component data contract
```jsonc
// /downloads/manifest.json (served by marketing Worker, hand-written for now)
{
  "version": "0.1.0",
  "channel": "stable",
  "released_at": "2026-…",
  "artifacts": {
    "windows-x64": { "url": "…", "size": 0, "sha256": "…" },
    "macos-arm64": { "url": "…", "size": 0, "sha256": "…" },
    "macos-x64":   { "url": "…", "size": 0, "sha256": "…" },
    "linux-x64-deb":     { "url": "…", "size": 0, "sha256": "…" },
    "linux-x64-appimage":{ "url": "…", "size": 0, "sha256": "…" }
  }
}
```
The `<DownloadPicker />` component only reads this manifest; **swapping to
GitHub Releases or R2 later is a URL change, not a UI change.**

### Deploy
- Worker: `pumpos-marketing` (`env.preview` = `dev-pumpos-marketing`).
- Route: `pumpos.abdullahnettoor.com/*` (and later `pumpos.app/*`).

**Exit criteria:** apex serves marketing; Lighthouse ≥95 across perf/SEO/best
practices; download page renders manifest correctly; console redirect from
apex root removed.

### What shipped in code
- `apps/marketing` — Astro 5 (`output: 'static'`) + `@astrojs/mdx`,
  `@astrojs/sitemap`, and Tailwind v4 via `@tailwindcss/vite`. Brand tokens
  mirrored from `packages/ui` in `src/styles/global.css`.
- Pages: `/` (hero + features + how-it-works + CTA), `/download` (OS-detected
  recommended CTA + per-platform cards driven by a runtime manifest fetch),
  `/legal/privacy`, `/legal/terms`. Shared `BaseLayout.astro` with canonical +
  OG/Twitter tags, header/footer, `favicon.svg`, `og-default.svg`.
- Download data contract: `public/downloads/manifest.json` (placeholder, all
  URLs `null` → cards show "Coming soon"). The page only reads this file, so
  M5 swaps in real artifact URLs without UI changes.
- `content.config.ts` scaffolds `blog` + `docs` collections (empty) for M4.
- `sitemap-index.xml` + `robots.txt` generated; `SITE` env overrides the apex
  for dev vs prod sitemaps/canonicals.
- Wired into the monorepo: `apps/marketing/wrangler.toml`
  (`pumpos-marketing` / `dev-pumpos-marketing`, apex custom-domain route,
  preview pinned to workers.dev), root scripts `dev:marketing`,
  `deploy:marketing`, `build:marketing`; `.gitignore` ignores `.astro/`.

### Manual / follow-up
1. **Deploy:** `npm run deploy:dev --workspace=apps/marketing` (preview →
   workers.dev) or `npm run deploy --workspace=apps/marketing` (prod → apex
   custom domain, auto-provisions DNS + cert like M1).
2. **Move console off the apex:** once marketing owns the apex, remove any old
   `pumpos.abdullahnettoor.com` binding from the former web Worker.
3. **Deferred polish:** real rasterized OG image (currently SVG), Cloudflare
   Web Analytics beacon, and richer screenshots on the landing page.

---

## M3 — Mobile PWA (`apps/mobile`)

Owner-focused, read-mostly. Ships only the surfaces you selected.

**Status: implemented (code).** All four tabs + auth + role gating build and
type-check. Remaining: real device QA, `m.` custom-domain deploy (manual), and
raster PWA icons (currently SVG).

### Stack
- Vite + React (same as console).
- Uses `@pump/ui` **primitives + hooks + services** (design tokens, TanStack
  Query wiring, Supabase auth, `CloudStationService`).
- **Does not** import operational screens (`ShiftsManagement`, `ExpensesList`,
  etc.) — those are desktop-only.
- Installable PWA (`manifest.webmanifest` + a minimal hand-rolled `sw.js`; no
  extra plugin dependency).

### Information architecture (v1)
```
Bottom tab bar
├── Home        → Owner dashboard: today's KPIs (sales, cash, variance),
│                 tank levels, active shifts count.
├── Shifts      → Live shift board: open shifts across stations, latest
│                 nozzle readings; drill-in shows readings + collections.
├── DSSR        → Snapshot browser: pick station + date → renders the
│                 immutable DSSR snapshot in a mobile-friendly layout.
└── Ledger      → Customer/supplier balance lookup (search → balance +
                   recent movements). Read-only.
```

### Auth
- Shared Supabase session (cookie scoped to `.pumpos.app` / `.pumpos.abdullahnettoor.com`).
- Role gate: only `Owner` role sees Home dashboard tab; `Manager`/`Accountant`
  see Shifts + DSSR + Ledger; `Staff` sees "Not authorized on mobile".

### Explicit non-goals for v1
- No offline (per AGENTS.md).
- No mutations of financial/operational records.
- No approvals (deferred to M3.5 if demand appears).

### Deploy
- Worker: `pumpos-mobile` (`env.preview` = `dev-pumpos-mobile`).
- Route: `m.pumpos.abdullahnettoor.com/*`.

**Exit criteria:** each of the four tabs renders live data end-to-end for a
demo org; Lighthouse mobile perf ≥90; installable on iOS/Android home screen;
data caching follows the `pump-data-caching` tiers (operational = 15s).

### What shipped in code
- `apps/mobile` — Vite + React PWA reusing `@pump/ui` (services, TanStack Query
  hooks, Supabase auth, design tokens). No operational/desktop screens imported.
- Auth: `src/lib/session.ts` mirrors the console wiring (`setApiBaseUrl` for
  `m.` hosts, `setAuthToken`, backend `/session` for role + name, cache purge on
  account switch).
- Shell: `MobileShell` (header + station chip picker + sign-out) + `BottomNav`
  with **role-gated tabs** — Owner: Home/Shifts/DSSR/Ledger; Manager:
  Shifts/DSSR/Ledger; Accountant: DSSR/Ledger; Staff: locked-out screen.
- Screens (all read-only, live data):
  - **Home** — today's KPIs (fuel sales, volume, collections, expenses,
    purchases, receivables, payables, cash variance) + shift-open badge, all
    business-day-resolved via `resolveBusinessDate`.
  - **Shifts** — live active-shift card (elapsed, operator, opening cash,
    nozzle count) + recent closed-shift summaries with fuel value + variance.
  - **DSSR** — date picker → live `useDailyDssrPreview` totals + collections
    breakdown.
  - **Ledger** — customers/suppliers segmented search by balance, tap to expand
    recent ledger entries.
- PWA: `manifest.webmanifest`, `theme-color`, apple-touch meta, SVG icons
  (192/512), and a minimal `sw.js` (network-first shell, never caches API/data).
- Wiring: `apps/mobile/wrangler.toml` (`pumpos-mobile` / `dev-pumpos-mobile`,
  `m.` custom-domain route, preview pinned to workers.dev); root scripts
  `dev:mobile` / `deploy:mobile` / `build:ui-mobile`; `tsconfig` project ref;
  `apps/mobile/src` added to the shared Tailwind `@source`; fonts vendored.

### Manual / follow-up
1. **Deploy:** `npm run deploy:dev --workspace=apps/mobile` (preview →
   workers.dev) or `npm run deploy --workspace=apps/mobile` (prod → `m.` custom
   domain).
2. **Supabase Auth:** add the `m.` hosts to Site URL + Redirect URLs so the
   shared session works there.
3. **Deferred polish:** raster PNG icons (currently SVG), on-device QA, and
   optional approvals/alerts tabs (M3.5).

---

## M4 — Docs & blog activation (deferred, low priority)

Only activates the collections scaffolded in M2.

**Status: implemented (code).** Docs + blog + RSS + Pagefind search build and
render; two sample docs + one sample post ship as starters. Remaining: author
real content.

### Scope
- `/docs` — user manual and admin guide (MDX). Sidebar generated from
  frontmatter. Search via Pagefind (static, no server).
- `/blog` — MDX posts, RSS feed, category tags.
- Author workflow: PR to `apps/marketing/src/content/{docs,blog}/…`; preview
  deploy on Cloudflare Worker `env.preview`.

### Not doing (unless asked)
- Headless CMS (Sanity/Contentful) — MDX in repo is enough at this stage.
- Comments / newsletter signup (add via a third-party embed later).

**Exit criteria:** first tutorial published; docs discoverable via search;
sitemap includes both trees.

### What shipped in code
- **Blog** — `/blog` index + `/blog/[slug]` post pages (Astro 5 content
  collections), `/rss.xml` feed (`@astrojs/rss`), sample post
  `introducing-pumpos.mdx`.
- **Docs** — `DocsLayout` with category-grouped sidebar (ordered by
  frontmatter `order`), `/docs` → first-doc redirect, `/docs/[slug]` pages,
  sample docs `getting-started` + `running-shifts`.
- **Search** — `astro-pagefind` integration; static index built from
  `data-pagefind-body` content; `<Search>` box in the docs sidebar.
- Header nav gains **Docs** + **Blog**; RSS `<link>` in `<head>`; `.prose-pump`
  typography for rendered MDX. Sitemap auto-covers both trees.
- To author: drop `.md`/`.mdx` into `apps/marketing/src/content/{docs,blog}/`
  with the frontmatter fields (`content.config.ts` schemas).

---

## M5 — Tauri updater + real downloads (deferred)

Wire the download manifest to real artifacts and enable in-app auto-update.

- Decide artifact host (GitHub Releases vs Cloudflare R2 vs both).
- CI: on tag push, build Tauri installers for each target, sign, upload,
  produce `manifest.json` (marketing) and `latest.json` (Tauri updater).
- Configure `tauri.conf.json` updater endpoint + public key.
- Marketing `<DownloadPicker />` swap manifest URL to the CI-produced one.

**Exit criteria:** installing from marketing → app auto-updates on next
release; SHA-256 verified in-app.

---

## Suggested sequence

**M1 → M2 → M3 → M4 → M5.** Each phase is independently testable and safe to
pause between. This lets you validate one surface at a time before the next
lands.

## Principles applied

- **No domain model change.** Only deployment topology + one new client
  surface. Existing entities, events, snapshots all unchanged.
- **`@pump/ui` stays the shared UI kit.** Mobile app consumes primitives; no
  duplicate design system.
- **Caching tiers unchanged** — mobile uses the same TanStack Query tiers per
  `pump-data-caching`.
- **Data-driven downloads** — the download component doesn't care where
  artifacts live; we defer hosting decisions safely.
- **RLS + multi-tenant unchanged** — mobile hits the same API with the same
  tokens.
