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

### M1.a — Rename `apps/web` → `apps/console`
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

---

## M2 — Marketing site (`apps/marketing`)

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

---

## M3 — Mobile PWA (`apps/mobile`)

Owner-focused, read-mostly. Ships only the surfaces you selected.

### Stack
- Vite + React (same as console).
- Uses `@pump/ui` **primitives + hooks + services** (design tokens, TanStack
  Query wiring, Supabase auth, `CloudStationService`).
- **Does not** import operational screens (`ShiftsManagement`, `ExpensesList`,
  etc.) — those are desktop-only.
- Installable PWA (`manifest.webmanifest`, service worker via `vite-plugin-pwa`).

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

---

## M4 — Docs & blog activation (deferred, low priority)

Only activates the collections scaffolded in M2.

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
