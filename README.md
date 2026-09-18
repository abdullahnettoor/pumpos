# PumpOS ── The Operating System for Fuel Retail

PumpOS is a multi-tenant, offline-resilient fuel station management platform tailored primarily for retail outlets. It is designed to be a high-performance operational instrument for station managers and owners, emphasizing shift-based tracking, strong auditability, and absolute multi-tenant data isolation.

_Note: PumpOS is an operational operating system focused on fuel station management, NOT a POS system or traditional accounting software._

---

## 🚀 Core Architectural Principles

- **Shift-Centric Operations**: Everything centers around shifts (Shift ➔ Operations ➔ DSSR ➔ Reports). All transactions—expenses, purchases, collections, credit sales, manual sales, and nozzle readings—must belong to an active shift.
- **Cloud Authoritative with Offline Cache**: Supabase PostgreSQL is the source of truth. The desktop shell uses a local SQLite cache to remain operationally resilient offline, eventually reconciling events back to the cloud.
- **Event-Driven Architecture (EDA)**: Business actions trigger auditable events (e.g., `SHIFT_OPENED`, `SALE_RECORDED`) that drive synchronization, audit logs, and reporting.
- **Nozzle-Derived Fuel Sales**: Fuel sales volume is strictly derived from closing and opening nozzle readings, not manual entries.
- **DSSR Snapshot Preservation**: Daily Shift Summary Reports (DSSR) are generated during shift closure, stored permanently, and never recalculated or modified post-generation.
- **Variance Visibility**: Expected stock vs. actual stock variance is tracked as a first-class concept, never hidden within reports.

---

## 🛠️ Technology Stack

| Layer              | Technologies                                                                                |
| :----------------- | :------------------------------------------------------------------------------------------ |
| **Desktop Client** | React 18, TypeScript, Vite, Tauri v2, TailwindCSS, shadcn/ui, TanStack Query/Table, Zustand |
| **API Layer**      | Hono, TypeScript, Cloudflare Workers                                                        |
| **Database & ORM** | Supabase (PostgreSQL), Drizzle ORM, SQLite (local desktop cache)                            |
| **Validation**     | Zod, React Hook Form                                                                        |

---

## 📁 Repository Structure

```text
pump-erp/
├── apps/
│   ├── api/             # Hono API Layer deployed to Cloudflare Workers
│   └── desktop/         # Tauri v2 desktop application shell (Vite + React)
├── packages/
│   ├── db/              # Database schema, migrations, Drizzle Client
│   ├── shared/          # Shared Zod validation schemas and common TypeScript types
│   └── ui/              # Shared UI components (Shift Management, DSSR, Station Setup)
├── brand/               # Canonical brand artwork, fanned into each app by `npm run brand`
├── supabase/            # Supabase database configurations, seed data, and schema definitions
├── AGENTS.md            # Architectural, business, and engineering rules for AI contributors
└── package.json         # Monorepo workspaces configuration
```

---

## 🏁 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Rust & Cargo](https://www.rust-lang.org/) (For compiling the Tauri desktop app)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (For local database migrations)

### Installation

Clone the repository and install all workspace dependencies from the root directory:

```bash
npm install
```

### Vendored assets

Fonts and brand artwork are served from each app's own `public/` directory, so
the same bytes are copied into every app rather than imported. Both copies are
committed; re-run the script that owns them after changing a source:

```bash
npm run fonts   # downloads Plus Jakarta Sans + Geist Mono into apps/*/public/fonts
npm run brand   # copies brand/ into apps/*/public/brand
```

Both are idempotent — re-running with nothing changed rewrites nothing.
`npm run brand` also reaches `apps/marketing`, which is a standalone Astro site
rather than an npm workspace and so cannot import from `@pump/ui`. Adding a new
app means adding it to the `targets` list in each script.

The in-app React mark lives in `packages/ui/src/pump-ds/brand/`; a test keeps it
in step with `brand/pumpos-mark.svg`.

### App icons

Every icon is **derived** from `brand/pumpos-mark.svg` — none is hand-authored,
and none contains text. (The set this replaced drew a letter in the brand
typeface, which does not load in a browser tab, a home-screen install or an app
switcher, so each icon silently fell back to a system font.) After changing the
mark:

```bash
npm run brand:icons    # mark -> container lockup, mobile icons, 1024 master
npm run icons:desktop  # 1024 master -> the whole Tauri bundle icon set
```

`brand:icons` writes the container lockup (`brand/pumpos-container.svg`), the
mobile favicon / 192 / maskable 512 / apple-touch PNG, and the 1024 master. The
container is the inspectable tile artwork and the seed for the rasters; it is
deliberately _not_ fanned out by `npm run brand`, because no app requests it by
URL — the favicons use the bare mark. `icons:desktop` fans the master into every
raster the bundler references, including the Windows Store tiles, the `.icns`
and `.ico`, and the Android and iOS variants — so there is a reproducible path
from the one path in the mark to an installed app icon.

Both are idempotent, so a re-run with nothing changed rewrites nothing. Commit
the output of both; CI does not regenerate them, and
`scripts/brand-icons.test.mjs` fails if a committed file drifts from what the
mark derives.

Two constraints are encoded in `planIcons()` rather than left to judgement: the
maskable 512 is square and sized so the mark's diagonal stays inside Android's
central-80% safe circle, and the apple-touch icon is a square PNG because iOS
ignores an SVG there and applies its own rounding.

### Database Setup

1. Start your local Supabase instances or link your production Supabase database:
   ```bash
   npx supabase start
   ```
2. Apply database migrations to seed your local schema:
   ```bash
   npm run db:migrate --workspace=packages/db
   ```

### Running the Development Environment

You can start the separate workspaces using the following scripts from the root directory:

- **Run Desktop Client**:
  ```bash
  npm run dev:desktop
  ```
- **Run Hono API**:

  ```bash
  npm run dev:api
  ```

  This uses the linked remote Supabase config by default.

- **Run Hono API against local Docker Supabase**:
  ```bash
  npm run dev:api:local
  ```

### API + Hyperdrive Guide

For local API setup (Hyperdrive local connection + required secrets) and production deployment steps for both Worker API and Hyperdrive, see:

- `docs/API-HYPERDRIVE-DEPLOYMENT.md`

### Releasing & incident response

- [`RELEASING.md`](RELEASING.md) — how a release is cut and what deploys when
- [`docs/rollback-runbook.md`](docs/rollback-runbook.md) — **how to undo a bad
  production release.** Read it before you need it; the first section is the
  judgement about whether a code rollback is safe at all once a migration has run

---

## 🔒 Multi-Tenancy & Security

Every business-related table must include `organization_id` and, where applicable, `station_id`. Database security is enforced using PostgreSQL Row-Level Security (RLS) policies to guarantee absolute tenant isolation.

MVP Roles supported:

- **Owner**
- **Manager**
- **Accountant**
- **Staff**

---

## 📝 Guidelines & Code Quality Standards

Before contributing or adding new features, please review [AGENTS.md](file:///Users/abdullahnettoor/Projects/pump-erp/AGENTS.md) for full context:

- **UI Design Pattern**: List ➔ Drawer ➔ Edit. Avoid modal-heavy workflows. Keep interfaces clean, compact, and information-dense.
- **Component Reuse**: Check `packages/ui` for existing components (`PageLayout`, `DataTable`, `Drawer`, etc.) before creating new ones.
- **Metadata Columns**: Frequently queried fields should reside in explicit tables columns. Rarely queried fields should use a `JSONB` metadata column to prevent schema clutter.
