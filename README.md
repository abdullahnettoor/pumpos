# PumpOS ── The Operating System for Fuel Retail

PumpOS is a multi-tenant, offline-resilient fuel station management platform tailored primarily for retail outlets. It is designed to be a high-performance operational instrument for station managers and owners, emphasizing shift-based tracking, strong auditability, and absolute multi-tenant data isolation.

*Note: PumpOS is an operational operating system focused on fuel station management, NOT a POS system or traditional accounting software.*

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

| Layer | Technologies |
| :--- | :--- |
| **Desktop Client** | React 18, TypeScript, Vite, Tauri v2, TailwindCSS, shadcn/ui, TanStack Query/Table, Zustand |
| **API Layer** | Hono, TypeScript, Cloudflare Workers |
| **Database & ORM** | Supabase (PostgreSQL), Drizzle ORM, SQLite (local desktop cache) |
| **Validation** | Zod, React Hook Form |

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

---

## 🔒 Multi-Tenancy & Security

Every business-related table must include `organization_id` and, where applicable, `station_id`. Database security is enforced using PostgreSQL Row-Level Security (RLS) policies to guarantee absolute tenant isolation. 

MVP Roles supported:
* **Owner**
* **Manager**
* **Accountant**
* **Staff**

---

## 📝 Guidelines & Code Quality Standards

Before contributing or adding new features, please review [AGENTS.md](file:///Users/abdullahnettoor/Projects/pump-erp/AGENTS.md) for full context:
* **UI Design Pattern**: List ➔ Drawer ➔ Edit. Avoid modal-heavy workflows. Keep interfaces clean, compact, and information-dense.
* **Component Reuse**: Check `packages/ui` for existing components (`PageLayout`, `DataTable`, `Drawer`, etc.) before creating new ones.
* **Metadata Columns**: Frequently queried fields should reside in explicit tables columns. Rarely queried fields should use a `JSONB` metadata column to prevent schema clutter.
